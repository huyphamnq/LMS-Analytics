import os
import joblib
import numpy as np
from model_manager import get_model_manager, ModelManager

# =========================================================
# Đường dẫn đến thư mục chứa models
# =========================================================
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')

# Thứ tự 9 metrics theo đúng thứ tự lúc huấn luyện Random Forest
METRICS = [
    'active_days', 'login_count', 'video_views', 'document_reads', 'discussion',
    'assignment_duration_mins', 'ontime_margin', 'days_since_last_login', 'session_duration'
]

# 27 features = 9 metrics × 3 tuần (W1, W2, W3)
FEATURE_COLUMNS = [f'{m}_w{w}' for w in [1, 2, 3] for m in METRICS]

# ⚠️ DEPRECATED: No longer using "general" model
# All predictions now use subject-specific models
# See predict_risk_for_subject() for the new prediction flow


def _build_feature_vector(weekly_data: list) -> np.ndarray:
    """
    Xây dựng vector 27 features từ weekly_data (list các dict theo tuần).
    Công thức: 9 metrics × 3 tuần (W1, W2, W3) = 27 features.
    weekly_data phải chứa các tuần có key 'week' (1, 2, 3).
    Tuần nào thiếu sẽ được điền 0.
    
    9 Metrics (theo đúng thứ tự huấn luyện):
      active_days, login_count, video_views, document_reads, discussion,
      assignment_duration_mins, ontime_margin, days_since_last_login, session_duration
    """
    # Index weekly_data theo key 'week'
    week_map = {w.get('week'): w for w in weekly_data if w.get('week') in [1, 2, 3]}

    feature_values = []
    for w in [1, 2, 3]:
        week_dict = week_map.get(w, {})
        for m in METRICS:
            # login_count và online_count là cùng một trường — ưu tiên login_count
            val = week_dict.get(m, week_dict.get('online_count', 0) if m == 'login_count' else 0)
            feature_values.append(float(val) if val is not None else 0.0)

    return np.array([feature_values])  # shape (1, 27)


def calculate_effort_score(weekly_data: list) -> float:
    """
    Tính effort_score (thang điểm 1-10) dựa trên Feature Importance của mô hình AI.
    Sử dụng tất cả 11 chỉ số hành vi từ tuần mới nhất.
    """
    import math
    week_map = {w.get('week'): w for w in weekly_data if w.get('week') in [1, 2, 3]}
    # Lấy tuần mới nhất có dữ liệu
    week_dict = week_map.get(3) or week_map.get(2) or week_map.get(1) or {}
    
    if not week_dict:
        return 1.0

    # Bảng trọng số dựa trên độ quan trọng của đặc trưng (Feature Importance)
    # Hướng: Hành vi tích cực -> Cộng điểm, Hành vi tiêu cực (vd: trễ nộp bài) -> Trừ/Ít điểm
    WEIGHTS = {
        'ontime_margin': 0.1,    # Biên an toàn (nộp sớm)
        'discussion': 2.0,
        'active_days': 1.5,
        'login_count': 0.5,
        'session_duration': 0.02, # 1 điểm nỗ lực cho mỗi 50 phút
        'video_views': 0.4,
        'document_reads': 0.6,
        'assignment_duration_mins': 0.01,
        'days_since_last_login': -0.5, # Phạt nếu không truy cập lâu
    }

    raw_effort = 0.0
    for metric, weight in WEIGHTS.items():
        val = week_dict.get(metric, 0)
        # Xử lý login_count đặc biệt nếu chỉ có online_count
        if metric == 'login_count' and val == 0:
            val = week_dict.get('online_count', 0)
        
        raw_effort += float(val or 0) * weight

    # Chuẩn hóa về thang 1-10 sử dụng hàm bão hòa (Saturation function)
    # K=20 là hệ số độ nhạy (student đạt ~40 raw effort sẽ đạt ~8.5-9 điểm)
    K = 20
    # Đảm bảo raw_effort không âm trước khi tính exp
    clamped_effort = max(0, raw_effort)
    score = 1 + 9 * (1 - math.exp(-clamped_effort / K))
    
    return round(score, 1)


# =========================================================
# NEW: Subject-based Model Support
# =========================================================

def predict_risk_for_subject(
    subject_id: str,
    weekly_data: list,
    force_reload: bool = False
) -> dict:
    """
    Dự đoán rủi ro cho một subject cụ thể.

    Args:
        subject_id: ID của subject (ví dụ: "math", "english", ...)
        weekly_data: list các dict weekly, mỗi dict có key 'week' và các metrics.
        force_reload: Nếu True, load lại model từ file (bypass cache)

    Returns:
        dict với risk_probability, risk_label, threshold, subject_id, model_version
        hoặc dict error nếu model không tồn tại
    """
    try:
        manager = get_model_manager()
        model, scaler, config, metadata = manager.load_model(subject_id, force_reload=force_reload)

        if model is None or scaler is None:
            return {
                "error": f"Model not found for subject '{subject_id}'",
                "subject_id": subject_id,
                "risk_probability": None,
                "risk_label": None,
            }

        # Build feature vector
        X = _build_feature_vector(weekly_data)
        X_scaled = scaler.transform(X)

        # Predict
        prob_risk = float(model.predict_proba(X_scaled)[0, 1])
        threshold = metadata.threshold

        # Classify
        risk_label = "Nguy cơ" if prob_risk >= threshold else "An toàn"

        return {
            "subject_id": subject_id,
            "subject_name": metadata.subject_name,
            "risk_probability": round(prob_risk, 4),
            "risk_label": risk_label,
            "threshold": threshold,
            "model_version": metadata.version,
            "accuracy": metadata.accuracy,
            "trained_date": metadata.trained_date,
        }

    except Exception as e:
        print(f"Error predicting for subject '{subject_id}': {e}")
        return {
            "error": str(e),
            "subject_id": subject_id,
            "risk_probability": None,
            "risk_label": None,
        }


def get_available_subjects() -> list:
    """
    Lấy danh sách các subject có model.

    Returns:
        list các dict chứa metadata của mỗi subject
    """
    try:
        manager = get_model_manager()
        return manager.list_available_subjects()
    except Exception as e:
        print(f"Error listing available subjects: {e}")
        return []


def get_subject_metadata(subject_id: str) -> dict:
    """
    Lấy metadata của một subject.

    Args:
        subject_id: ID của subject

    Returns:
        dict metadata hoặc None
    """
    try:
        manager = get_model_manager()
        metadata = manager.get_metadata(subject_id)
        if metadata:
            result = metadata.to_dict()
            _model, _scaler, config, _metadata = manager.load_model(subject_id)
            if isinstance(config, dict):
                for key in ("features", "top_risk_increase", "top_risk_decrease"):
                    if key in config:
                        result[key] = config[key]
            return result
        return None
    except Exception as e:
        print(f"Error getting metadata for subject '{subject_id}': {e}")
        return None
