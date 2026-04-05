from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import cv2
import numpy as np
import easyocr
import re
import base64
from typing import List, Tuple, Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OCR_READER = easyocr.Reader(["en"], gpu=False)

PRICE_REGEX = re.compile(r"(?:\\$|USD)\\s?(\\d{1,3}(?:[\\s,]\\d{3})*(?:\\.\\d{1,2})?)")
PERCENT_REGEX = re.compile(r"(\\d{1,2})\\s?%")

CATEGORY_KEYWORDS = {
    "Tech": ["laptop", "tablet", "monitor", "phone", "headphone", "earbud", "camera", "drone", "keyboard", "mouse"],
    "Fashion": ["hoodie", "shirt", "dress", "jeans", "shoe", "sneaker", "boot", "jacket", "watch"],
    "Gaming": ["gaming", "console", "controller", "gpu", "graphics", "pc", "keyboard", "mouse"],
    "Digital": ["software", "subscription", "license", "ebook"],
    "Home": ["vacuum", "kitchen", "lamp", "chair", "sofa", "bedding", "furniture", "appliance"],
    "Food": ["snack", "coffee", "tea", "chocolate", "grocery", "restaurant", "meal"],
}


def preprocess_image(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    target_width = 1400
    if width < target_width:
        scale = target_width / max(width, 1)
        image = cv2.resize(image, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_CUBIC)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    thresh = cv2.adaptiveThreshold(
        enhanced, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 2
    )
    return thresh


def encode_image_to_data_url(image: np.ndarray) -> str:
    success, buffer = cv2.imencode(".png", image)
    if not success:
        return ""
    encoded = base64.b64encode(buffer.tobytes()).decode("utf-8")
    return f"data:image/png;base64,{encoded}"


def extract_product_image(image: np.ndarray) -> Tuple[str, bool, Optional[Tuple[int, int, int, int]]]:
    height, width = image.shape[:2]
    if height == 0 or width == 0:
        return "", False, None

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    mask = cv2.threshold(gray, 245, 255, cv2.THRESH_BINARY_INV)[1]
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.dilate(mask, kernel, iterations=1)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return "", False, None

    image_area = width * height
    center_x, center_y = width / 2, height / 2
    best_score = 0
    best_box = None

    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area < image_area * 0.02 or area > image_area * 0.7:
            continue
        if w < width * 0.18 or h < height * 0.18:
            continue
        box_center_x = x + w / 2
        box_center_y = y + h / 2
        dist = ((box_center_x - center_x) ** 2 + (box_center_y - center_y) ** 2) ** 0.5
        dist_norm = dist / max(width, height)
        score = area * (1 - dist_norm)
        if score > best_score:
            best_score = score
            best_box = (x, y, w, h)

    if not best_box:
        return "", False, None

    x, y, w, h = best_box
    pad_x = int(w * 0.05)
    pad_y = int(h * 0.05)
    x0 = max(x - pad_x, 0)
    y0 = max(y - pad_y, 0)
    x1 = min(x + w + pad_x, width)
    y1 = min(y + h + pad_y, height)
    cropped = image[y0:y1, x0:x1]
    if cropped.size == 0:
        return "", False, None

    return encode_image_to_data_url(cropped), True, (x0, y0, x1, y1)


def group_lines(results: List[Tuple[List[List[int]], str, float]]):
    blocks = []
    for bbox, text, confidence in results:
        cleaned = re.sub(r"\\s+", " ", text).strip()
        if not cleaned or confidence < 0.2:
            continue
        x_coords = [point[0] for point in bbox]
        y_coords = [point[1] for point in bbox]
        x_min, x_max = min(x_coords), max(x_coords)
        y_min, y_max = min(y_coords), max(y_coords)
        blocks.append(
            {
                "text": cleaned,
                "confidence": confidence,
                "x": x_min,
                "y": y_min,
                "w": x_max - x_min,
                "h": y_max - y_min,
                "cy": (y_min + y_max) / 2,
            }
        )

    blocks.sort(key=lambda b: (b["cy"], b["x"]))
    lines = []
    for block in blocks:
        placed = False
        for line in lines:
            if abs(block["cy"] - line["cy"]) < max(line["h"], block["h"]) * 0.6:
                line["items"].append(block)
                line["cy"] = (line["cy"] + block["cy"]) / 2
                line["h"] = max(line["h"], block["h"])
                placed = True
                break
        if not placed:
            lines.append({"items": [block], "cy": block["cy"], "h": block["h"]})

    formatted_lines = []
    for line in lines:
        line["items"].sort(key=lambda item: item["x"])
        text = " ".join(item["text"] for item in line["items"]).strip()
        if len(text) < 2:
            continue
        avg_conf = sum(item["confidence"] for item in line["items"]) / len(line["items"])
        formatted_lines.append({
            "text": text,
            "cy": line["cy"],
            "h": line["h"],
            "confidence": avg_conf,
            "x": min(item["x"] for item in line["items"]),
            "y": min(item["y"] for item in line["items"]),
            "w": max(item["x"] + item["w"] for item in line["items"]) - min(item["x"] for item in line["items"]),
            "h_box": max(item["y"] + item["h"] for item in line["items"]) - min(item["y"] for item in line["items"]),
        })
    return formatted_lines


def parse_price_text(text: str) -> Optional[float]:
    cleaned = text.replace("S", "$").replace("s", "$")
    match = PRICE_REGEX.search(cleaned)
    if not match:
        return None
    numeric = match.group(1).replace(",", "").replace(" ", "").replace("O", "0")
    try:
        return float(numeric)
    except ValueError:
        return None


def _distance_to_box(line: dict, box: Tuple[int, int, int, int]) -> float:
    x0, y0, x1, y1 = box
    cx = line["x"] + line["w"] / 2
    cy = line["y"] + line["h_box"] / 2
    bx = (x0 + x1) / 2
    by = (y0 + y1) / 2
    return ((cx - bx) ** 2 + (cy - by) ** 2) ** 0.5


def _is_junk_text(text: str) -> bool:
    lower = text.lower()
    if len(text) < 6:
        return True
    if re.search(r"(add to cart|buy now|prime|shipping|returns|reviews|rating|stars|quantity|in stock)", lower):
        return True
    if re.search(r"(coupon|save|off|deal|limited|promo)", lower) and len(text) < 12:
        return True
    if re.fullmatch(r"[\d\W]+", text):
        return True
    return False


def _letters_ratio(text: str) -> float:
    letters = sum(1 for c in text if c.isalpha())
    return letters / max(len(text), 1)


def _numbers_ratio(text: str) -> float:
    nums = sum(1 for c in text if c.isdigit())
    return nums / max(len(text), 1)


def _best_title_segment(text: str) -> str:
    segments = re.split(r"[|•·•/\\-]{1,}|\\s{2,}|\\u2014|\\u2013", text)
    cleaned_segments = [segment.strip(" -•|/") for segment in segments if segment.strip()]
    if not cleaned_segments:
        return text

    def segment_score(segment: str) -> float:
        if _is_junk_text(segment):
            return -1
        score = min(len(segment), 80)
        score += _letters_ratio(segment) * 40
        score -= _numbers_ratio(segment) * 30
        if len(segment) > 100:
            score -= 20
        return score

    best = max(cleaned_segments, key=segment_score)
    return best if segment_score(best) > 0 else text


def _build_product_block(lines: List[dict], image_box: Optional[Tuple[int, int, int, int]]):
    if not image_box:
        return lines

    x0, y0, x1, y1 = image_box
    img_cx = (x0 + x1) / 2
    img_cy = (y0 + y1) / 2
    img_w = x1 - x0
    img_h = y1 - y0
    block_radius_x = img_w * 1.1
    block_radius_y = img_h * 1.2

    def in_block(line: dict) -> bool:
        cx = line["x"] + line["w"] / 2
        cy = line["y"] + line["h_box"] / 2
        return abs(cx - img_cx) <= block_radius_x and abs(cy - img_cy) <= block_radius_y

    block_lines = [line for line in lines if in_block(line)]
    return block_lines if block_lines else lines


def _cluster_lines(lines: List[dict], max_distance: float = 140.0) -> List[List[dict]]:
    if not lines:
        return []
    clusters: List[List[dict]] = []
    visited = set()

    def line_center(line: dict) -> Tuple[float, float]:
        return (line["x"] + line["w"] / 2, line["y"] + line["h_box"] / 2)

    for idx, line in enumerate(lines):
        if idx in visited:
            continue
        cluster = []
        queue = [idx]
        visited.add(idx)
        while queue:
            current_idx = queue.pop(0)
            current = lines[current_idx]
            cluster.append(current)
            cx, cy = line_center(current)
            for j, other in enumerate(lines):
                if j in visited:
                    continue
                ox, oy = line_center(other)
                dist = ((cx - ox) ** 2 + (cy - oy) ** 2) ** 0.5
                if dist <= max_distance:
                    visited.add(j)
                    queue.append(j)
        clusters.append(cluster)
    return clusters


def _select_anchor_cluster(clusters: List[List[dict]], image_box: Optional[Tuple[int, int, int, int]]) -> List[dict]:
    if not clusters:
        return []
    if not image_box:
        return max(clusters, key=lambda cluster: len(cluster))
    x0, y0, x1, y1 = image_box
    anchor_cx = (x0 + x1) / 2
    anchor_cy = (y0 + y1) / 2

    def cluster_score(cluster: List[dict]) -> float:
        centers = [(line["x"] + line["w"] / 2, line["y"] + line["h_box"] / 2) for line in cluster]
        avg_cx = sum(c[0] for c in centers) / len(centers)
        avg_cy = sum(c[1] for c in centers) / len(centers)
        dist = ((avg_cx - anchor_cx) ** 2 + (avg_cy - anchor_cy) ** 2) ** 0.5
        return -dist + len(cluster) * 8

    return max(clusters, key=cluster_score)


def extract_fields(lines: List[dict], product_url: str, image_box: Optional[Tuple[int, int, int, int]]):
    block_lines = _build_product_block(lines, image_box)
    clusters = _cluster_lines(block_lines, max_distance=140.0)
    block_lines = _select_anchor_cluster(clusters, image_box) if clusters else block_lines
    prices = []
    for line in block_lines:
        for match in PRICE_REGEX.finditer(line["text"].replace("S", "$").replace("s", "$")):
            try:
                numeric = match.group(1).replace(",", "").replace(" ", "").replace("O", "0")
                value = float(numeric)
            except ValueError:
                continue
            prices.append(
                {
                    "value": value,
                    "text": match.group(0),
                    "line": line["text"],
                    "original": bool(re.search(r"(list|was|reg|original|msrp|retail|compare)", line["text"], re.I)),
                    "cy": line["cy"],
                    "confidence": line.get("confidence", 0.5),
                }
            )

    current_price = ""
    original_price = ""
    if prices:
        def price_score(price: dict) -> float:
            score = price.get("confidence", 0.5) * 100
            if re.search(r"(now|sale|deal|price|today|with coupon|save)", price["line"], re.I):
                score += 40
            return score

        current_candidates = [p for p in prices if re.search(r"(now|sale|deal|price|today|with coupon|save)", p["line"], re.I)]
        original_candidates = [p for p in prices if p["original"] or re.search(r"(was|list|original|before)", p["line"], re.I)]

        if current_candidates:
            chosen = max(current_candidates, key=price_score)
            current_price = f"{chosen['value']:.2f}"
        if original_candidates:
            chosen = max(original_candidates, key=price_score)
            original_price = f"{chosen['value']:.2f}"

        if not current_price:
            sorted_prices = sorted(prices, key=lambda p: p["value"])
            current_price = f"{sorted_prices[0]['value']:.2f}"
        if not original_price and len(prices) > 1:
            original_price = f"{max(p['value'] for p in prices):.2f}"

    discount_text = ""
    for line in block_lines:
        if re.search(r"(save|off|coupon|deal|limited|promo)", line["text"], re.I):
            discount_text = line["text"]
            break
    if not discount_text:
        percent_match = next((line for line in lines if PERCENT_REGEX.search(line["text"])), None)
        if percent_match:
            discount_text = percent_match["text"]

    title = ""
    if block_lines:
        def title_score(line: dict) -> float:
            text = line["text"]
            if _is_junk_text(text):
                return -1
            score = min(len(text), 90)
            score += line.get("confidence", 0.5) * 50
            if image_box:
                score -= _distance_to_box(line, image_box) * 0.02
            if re.search(r"(\\$|%|coupon|save|off)", text, re.I):
                score -= 50
            if _letters_ratio(text) > 0.6:
                score += 15
            if _numbers_ratio(text) > 0.35:
                score -= 15
            if len(text) > 120:
                score -= 25
            return score

        candidates = sorted(block_lines, key=title_score, reverse=True)
        if candidates and title_score(candidates[0]) > 0:
            title = candidates[0]["text"]
    if not title and block_lines:
        title = max(block_lines, key=lambda l: len(l["text"]))["text"]
    if title:
        title = _best_title_segment(title)
    if len(title) > 90:
        title = title[:90].strip()

    description = ""
    if title:
        title_line = next((line for line in block_lines if line["text"] == title), None)
        if title_line:
            def desc_score(line: dict) -> float:
                text = line["text"]
                if _is_junk_text(text):
                    return -1
                score = min(len(text), 90)
                if line["cy"] < title_line["cy"]:
                    score -= 15
                score -= abs(line["cy"] - title_line["cy"]) * 0.02
                if _letters_ratio(text) < 0.55:
                    score -= 10
                if len(text) > 160:
                    score -= 25
                return score

            desc_candidates = sorted(block_lines, key=desc_score, reverse=True)
            if desc_candidates and desc_score(desc_candidates[0]) > 0:
                description = desc_candidates[0]["text"]
    if len(description) > 140:
        description = description[:140].strip()
    if description and _is_junk_text(description):
        description = ""

    store = ""
    for line in lines:
        if re.search(r"(sold by|merchant|store|brand|seller|by)", line["text"], re.I):
            store = re.sub(r"^(sold by|merchant|store|brand|seller|by)[:\\s-]*", "", line["text"], flags=re.I).strip()
            break
    if not store and product_url:
        try:
            hostname = re.sub(r"^https?://", "", product_url).split("/")[0]
            store = hostname.replace("www.", "").split(".")[0].title()
        except Exception:
            store = ""

    category = ""
    title_lower = title.lower()
    for category_name, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in title_lower for keyword in keywords):
            category = category_name
            break

    return {
        "title": title,
        "price": current_price,
        "originalPrice": original_price,
        "discountText": discount_text,
        "store": store,
        "category": category,
        "imageUrl": "",
        "dealUrl": product_url,
        "description": description,
    }


@app.post("/api/admin/image-extract")
async def extract_from_image(
    image: UploadFile = File(...),
    productUrl: str = Form(""),
    affiliateUrl: str = Form(""),
):
    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise ValueError("Empty image")
        np_img = np.frombuffer(image_bytes, np.uint8)
        decoded = cv2.imdecode(np_img, cv2.IMREAD_COLOR)
        if decoded is None:
            raise ValueError("Unable to decode image")
        processed = preprocess_image(decoded)
        results = OCR_READER.readtext(processed)
        lines = group_lines(results)
        cropped_url, used_crop, image_box = extract_product_image(decoded)
        payload = extract_fields(lines, productUrl or "", image_box)
        if cropped_url:
            payload["imageUrl"] = cropped_url
        else:
            payload["imageUrl"] = encode_image_to_data_url(decoded)
        payload["useCroppedProductImage"] = bool(used_crop)
    except Exception:
        payload = {
            "title": "",
            "price": "",
            "originalPrice": "",
            "discountText": "",
            "store": "",
            "category": "",
            "imageUrl": "",
            "dealUrl": productUrl or "",
            "description": "",
            "useCroppedProductImage": False,
        }

    return payload
