# 📚 Model Management Guide

Hướng dẫn quản lý models cho hệ thống LMS Analytics với hỗ trợ multi-subject.

## 📁 Cấu trúc lưu trữ

```
backend/
├── models/
│   ├── subjects/              # Thư mục lưu models cho từng subject
│   │   ├── general/           # Model cũ (sau khi migrate)
│   │   │   ├── logistic_student_model.pkl
│   │   │   ├── scaler_student.pkl
│   │   │   └── metadata.json
│   │   ├── math/              # Model cho môn Toán
│   │   │   ├── model.pkl
│   │   │   ├── scaler.pkl
│   │   │   └── metadata.json
│   │   ├── english/           # Model cho môn Tiếng Anh
│   │   │   ├── model.pkl
│   │   │   ├── scaler.pkl
│   │   │   └── metadata.json
│   │   └── ...
│   
│   └── (cũ - vẫn giữ cho backward compatibility)
│       ├── logistic_student_model.pkl
│       ├── scaler_student.pkl
│       └── model_config.pkl
```

### Metadata format (metadata.json)

```json
{
  "subject_id": "math",
  "subject_name": "Môn Toán học",
  "version": "1.0",
  "accuracy": 0.85,
  "threshold": 0.55,
  "trained_date": "2026-04-17T10:30:00",
  "model_file": "model.pkl",
  "scaler_file": "scaler.pkl"
}
```

## 🚀 Migration từ hệ thống cũ

### Bước 1: Chạy migration script

```bash
cd backend
python migrate_models.py
```

**Kết quả:**
- Model cũ (logistic_student_model.pkl) được copy sang `models/subjects/general/`
- Tạo metadata.json với default config
- Subject ID sẽ là **"general"** cho backward compatibility

### Bước 2: Verify migration

```bash
# Xem danh sách subjects đã có
curl http://localhost:8000/subjects/list

# Output
{
  "subjects": [
    {
      "subject_id": "general",
      "subject_name": "General/Legacy Model",
      "version": "1.0",
      "accuracy": 0,
      "threshold": 0.5,
      "trained_date": "2026-04-17T...",
      "model_file": "logistic_student_model.pkl",
      "scaler_file": "scaler_student.pkl"
    }
  ]
}
```

## ➕ Thêm model cho subject mới

### Cách 1: Upload qua API (khuyên dùng)

**Endpoint:** `POST /subjects/{subject_id}/upload`

**Request:**
```bash
curl -X POST http://localhost:8000/subjects/math/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "model_file=@/path/to/model.pkl" \
  -F "scaler_file=@/path/to/scaler.pkl" \
  -F "subject_name=Môn Toán" \
  -F "version=1.0" \
  -F "accuracy=0.87" \
  -F "threshold=0.52"
```

**Response:**
```json
{
  "message": "Model uploaded successfully for subject 'math'",
  "subject_id": "math",
  "metadata": {
    "subject_id": "math",
    "subject_name": "Môn Toán",
    "version": "1.0",
    "accuracy": 0.87,
    "threshold": 0.52,
    "trained_date": "2026-04-17T...",
    "model_file": "model.pkl",
    "scaler_file": "scaler.pkl"
  }
}
```

### Cách 2: Copy file trực tiếp

1. Train model của bạn trên Google Colab
2. Download `model.pkl` và `scaler.pkl`
3. Tạo folder: `backend/models/subjects/YOUR_SUBJECT_ID/`
4. Copy files vào folder
5. Tạo `metadata.json` với format trên

**Ví dụ:**
```bash
mkdir -p backend/models/subjects/english
cp model.pkl backend/models/subjects/english/
cp scaler.pkl backend/models/subjects/english/
# Tạo metadata.json
```

## 🔮 Sử dụng models

### 1. Liệt kê tất cả subjects

```bash
GET /subjects/list
```

**Response:**
```json
{
  "subjects": [
    {
      "subject_id": "general",
      "subject_name": "General/Legacy Model",
      "version": "1.0",
      "accuracy": 0,
      "threshold": 0.5,
      ...
    },
    {
      "subject_id": "math",
      "subject_name": "Môn Toán",
      ...
    }
  ]
}
```

### 2. Lấy metadata của một subject

```bash
GET /subjects/{subject_id}/metadata

# Ví dụ:
GET /subjects/math/metadata
```

**Response:**
```json
{
  "subject_id": "math",
  "subject_name": "Môn Toán",
  "version": "1.0",
  "accuracy": 0.87,
  "threshold": 0.52,
  "trained_date": "2026-04-17T...",
  "model_file": "model.pkl",
  "scaler_file": "scaler.pkl"
}
```

### 3. Dự đoán rủi ro cho subject

```bash
POST /predict-risk-subject
```

**Request Body:**
```json
{
  "subject_id": "math",
  "weekly_data": [
    {
      "week": 1,
      "active_days": 5,
      "login_count": 8,
      "video_views": 12,
      "document_reads": 5,
      "discussion": 2,
      "assignment_duration_mins": 45.5,
      "ontime_margin": 2.5,
      "days_since_last_login": 1,
      "session_duration": 120
    },
    {
      "week": 2,
      "active_days": 4,
      "login_count": 6,
      ...
    },
    {
      "week": 3,
      "active_days": 3,
      ...
    }
  ]
}
```

**Response:**
```json
{
  "subject_id": "math",
  "subject_name": "Môn Toán",
  "risk_probability": 0.3425,
  "risk_label": "An toàn",
  "threshold": 0.52,
  "model_version": "1.0",
  "accuracy": 0.87,
  "trained_date": "2026-04-17T..."
}
```

### 4. Xóa model của subject

```bash
DELETE /subjects/{subject_id}

# Ví dụ:
DELETE /subjects/math
```

**Response:**
```json
{
  "message": "Model deleted for subject 'math'"
}
```

## 🏗️ Code Example (Python)

### Load model programmatically

```python
from model_manager import get_model_manager

manager = get_model_manager()

# Load model cho subject "math"
model, scaler, metadata = manager.load_model("math")

if model and scaler:
    # Dùng model để predict
    X_scaled = scaler.transform(features)
    prediction = model.predict_proba(X_scaled)
    print(f"Risk: {prediction[0, 1]:.4f}")
    print(f"Threshold: {metadata.threshold}")
else:
    print("Model not found")
```

### Save model programmatically

```python
from model_manager import get_model_manager, ModelMetadata
import joblib

manager = get_model_manager()

# Load your trained model
model = joblib.load("path/to/trained_model.pkl")
scaler = joblib.load("path/to/scaler.pkl")

# Create metadata
metadata = ModelMetadata(
    subject_id="physics",
    subject_name="Vật lý",
    version="1.0",
    accuracy=0.89,
    threshold=0.50,
)

# Save
manager.save_model("physics", model, scaler, metadata)
```

## 🔄 Backward Compatibility

Hệ thống hỗ trợ cả hàm cũ:
- `predict_risk()` - vẫn hoạt động như trước (dùng model "general")
- `calculate_effort_score()` - không thay đổi

**Migrate quanh:**
- New code: dùng `predict_risk_for_subject()` + `get_available_subjects()`
- Old code: vẫn có thể dùng `predict_risk()` sau khi migration

## ✅ Checklist Setup

- [ ] Chạy `python migrate_models.py` để convert model cũ
- [ ] Verify migration: `GET /subjects/list`
- [ ] Test prediction: `POST /predict-risk-subject` với subject_id="general"
- [ ] Prepare models cho các subject khác
- [ ] Upload models mới qua API hoặc copy file
- [ ] Test predictions cho từng subject
- [ ] Update frontend để chọn subject khi dự đoán

## 💡 Tips

1. **Tên subject_id:** Dùng snake_case (math, english, physics, data_science)
2. **Caching:** Models được cache trong memory, dùng `force_reload=True` nếu cần reload
3. **Threshold:** Mỗi subject có threshold riêng, có thể adjust sau training
4. **Metadata:** Lưu trữ tất cả info cần cho audit/tracking mô hình
5. **Version:** Tăng version khi retrain model cho cùng subject

## 🆘 Troubleshooting

### "Model not found for subject 'X'"
```
→ Check metadata.json tồn tại
→ Verify folder structure: models/subjects/X/
→ Chạy /subjects/list để xem available subjects
```

### Model load thất bại
```
→ Ensure .pkl files valid
→ Try force_reload=True
→ Check file permissions
```

### Metadata not found
```
→ Verify metadata.json format
→ Check JSON syntax: jsonlint tools
```

## 📚 References

- [model_manager.py](../model_manager.py) - Core model management
- [ml_service.py](../ml_service.py) - ML functions
- [routes/api.py](./api.py) - API endpoints
