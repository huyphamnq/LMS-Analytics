import os
import joblib
import numpy as np

# =========================================================
# Đường dẫn đến thư mục chứa models
# =========================================================
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')

# Thứ tự 9 metrics theo đúng thứ tự lúc huấn luyện
# Nguồn: logistic_regression.py (model training script)
METRICS = [
    'active_days', 'login_count', 'video_views', 'document_reads', 'discussion',
    'assignment_duration_mins', 'ontime_margin', 'days_since_last_login', 'session_duration'
]

# 27 features = 9 metrics × 3 tuần (W1, W2, W3)
FEATURE_COLUMNS = [f'{m}_w{w}' for w in [1, 2, 3] for m in METRICS]

# Cache models
_models = {
    'scaler': None,
    'logistic': None,
    'threshold': 0.5,  # ngưỡng mặc định, sẽ được cập nhật từ model_config.pkl
}


def load_models():
    """Tải scaler, logistic model và config (threshold tối ưu) vào memory nếu chưa có."""
    global _models
    if _models['scaler'] is None:
        try:
            _models['scaler']   = joblib.load(os.path.join(MODEL_DIR, 'scaler_student.pkl'))
            _models['logistic'] = joblib.load(os.path.join(MODEL_DIR, 'logistic_student_model.pkl'))
            # Đọc ngưỡng tối ưu từ model_config.pkl (được lưu trong logistic_regression.py)
            config_path = os.path.join(MODEL_DIR, 'model_config.pkl')
            if os.path.exists(config_path):
                config = joblib.load(config_path)
                _models['threshold'] = config.get('threshold', 0.5)
                print(f"Successfully loaded ML models. Optimal threshold: {_models['threshold']}")
            else:
                print("Successfully loaded ML models. Using default threshold: 0.5")
        except Exception as e:
            print(f"Error loading models. Please copy logistic_student_model.pkl and "
                  f"scaler_student.pkl into the backend/models/ directory. Error: {e}")
            raise


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


def predict_risk(weekly_data: list, selected_model: str = "Logistic Regression"):
    """
    Dự đoán rủi ro từ weekly_data (list dicts tuần 1-3).

    Args:
        weekly_data: list các dict weekly, mỗi dict có key 'week' và các metrics.
        selected_model: không dùng nữa, chỉ giữ để tương thích API cũ.

    Returns:
        dict với risk_probability, risk_label, model_probs.
    """
    load_models()

    X = _build_feature_vector(weekly_data)
    X_scaled = _models['scaler'].transform(X)

    prob_lr = float(_models['logistic'].predict_proba(X_scaled)[0, 1])

    # Dùng ngưỡng tối ưu từ model_config.pkl (không hardcode 0.5)
    threshold = _models.get('threshold', 0.5)
    risk_label = "Nguy cơ" if prob_lr >= threshold else "An toàn"

    return {
        "risk_probability": round(prob_lr, 4),
        "risk_label": risk_label,
        "threshold": threshold,
        "selected_model": "Logistic Regression",
        "model_probs": {
            "logistic": round(prob_lr, 4),
        }
    }


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

    # Bảng trọng số dựa trên độ quan trọng của đặc trưng (Model Coefficients)
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
