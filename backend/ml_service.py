import os
import joblib
import numpy as np

# Đường dẫn đến thư mục chứa models
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')

# Khởi tạo biến để cache models
_models = {
    'scaler': None,
    'logistic_regression': None,
    'random_forest': None,
    'lightgbm': None
}

def load_models():
    """Tải tất cả các models (scaler, lr, rf, lgb) vào memory nếu chưa có."""
    global _models
    
    if _models['scaler'] is None:
        try:
            _models['scaler'] = joblib.load(os.path.join(MODEL_DIR, 'scaler.pkl'))
            _models['logistic_regression'] = joblib.load(os.path.join(MODEL_DIR, 'logistic_regression.pkl'))
            _models['random_forest'] = joblib.load(os.path.join(MODEL_DIR, 'random_forest.pkl'))
            _models['lightgbm'] = joblib.load(os.path.join(MODEL_DIR, 'lightgbm.pkl'))
            print("Successfully loaded ML models.")
        except Exception as e:
            print(f"Error loading models. Please run generate_mock_models.py first. Error: {e}")

def predict_risk(data: dict):
    """
    Nhận dữ liệu (1 dòng) dưới dạng dict.
    Dự đoán xác suất bỏ học bằng 3 mô hình, kết hợp ensemble.
    """
    load_models()
    
    # Thứ tự features: active_days, login_count, video_views, document_reads, discussion, assignment_attempt, assignment_time
    features = [
        data.get("active_days", 0),
        data.get("login_count", 0),
        data.get("video_views", 0),
        data.get("document_reads", 0),
        data.get("discussion", 0),
        data.get("assignment_attempt", 0),
        data.get("assignment_time", 0)
    ]
    
    # 1. Chuyển thành mảng 2D (1 sample)
    X = np.array([features])
    
    # 2. Chuẩn hóa dữ liệu bằng scaler
    X_scaled = _models['scaler'].transform(X)
    
    # 3. Predict probability của class 1 (Risk)
    prob_lr = float(_models['logistic_regression'].predict_proba(X_scaled)[0, 1])
    prob_rf = float(_models['random_forest'].predict_proba(X_scaled)[0, 1])
    prob_lgb = float(_models['lightgbm'].predict_proba(X_scaled)[0, 1])
    
    # 4. Tính Ensemble (Trung bình cộng)
    avg_prob = (prob_lr + prob_rf + prob_lgb) / 3.0
    
    # Phân loại Threshold = 0.5
    risk_label = "Nguy cơ" if avg_prob >= 0.5 else "An toàn"
    
    return {
        "risk_probability": round(avg_prob, 4),
        "risk_label": risk_label,
        "model_probs": {
            "logistic": round(prob_lr, 4),
            "random_forest": round(prob_rf, 4),
            "lightgbm": round(prob_lgb, 4)
        }
    }

# Tính toán the effort score cho biểu đồ ScatterPlot Anomalities (Effort cao mà điểm kém / Effort thấp mà điểm tốt)
def calculate_effort_score(data: dict):
    # Trọng số đơn giản hóa để tính effort_score (Học càng chăm càng cao)
    score = (
        data.get("active_days", 0) * 1.5 + 
        data.get("video_views", 0) * 0.5 + 
        data.get("discussion", 0) * 2.0 + 
        data.get("document_reads", 0) * 0.8 + 
        data.get("assignment_time", 0) * 0.1
    )
    return round(score, 2)
