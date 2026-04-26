# � Hướng Dẫn Quản Lý Mô Hình Môn Học

Hướng dẫn sử dụng giao diện quản lý mô hình dự đoán rủi ro cho các môn học trên frontend.

## ✨ Tính Năng

Giao diện **Quản lý Môn Học** cho phép bạn:

1. **📤 Tải Mô Hình Môn Mới**
   - Upload file `model.pkl`, `scaler.pkl` và `config.pkl` (tùy chọn) từ Colab
   - Nhập metadata: tên môn, version, accuracy, threshold
   - Hỗ trợ drag & drop

2. **📋 Xem Danh Sách Môn Học**
   - Liệt kê tất cả môn học có mô hình được tải lên
   - Xem chi tiết từng mô hình
   - Xóa mô hình không cần dùng

## 🎯 Cách Sử Dụng

### Bước 1: Truy cập Quản lý Môn Học

Từ sidebar navigation, click vào **"📚 Quản lý Môn Học"**

```
Sidebar
├── 📊 Tổng quan
├── ⚠️ Cảnh báo sớm
├── 👨‍🎓 Phân tích sinh viên
├── 🔍 Phát hiện bất thường
├── 📝 Lịch sử can thiệp
├── 📚 Quản lý Môn Học ← Click here
└── ⚙️ Cài đặt
```

### Bước 2: Upload Mô Hình Môn Mới

**Tab: 📤 Tải Mô Hình Môn Mới**

#### Điền Thông Tin Mô Hình:

1. **ID Môn Học** (bắt buộc)
   - Định danh duy nhất
   - Dạng: `snake_case`
   - Ví dụ: `math`, `english`, `physics`, `data_science`

2. **Tên Môn Học** (bắt buộc)
   - Tên hiển thị
   - Ví dụ: `Môn Toán`, `Tiếng Anh`, `Vật Lý`

3. **Phiên Bản** (tùy chọn)
   - Mặc định: `1.0`
   - Tăng khi retrain: `1.1`, `1.2`, `2.0`, ...

4. **Độ Chính Xác** (tùy chọn)
   - Số từ 0-100
   - Ví dụ: `85.5`, `92`, `78.3`
   - Nếu không biết, để trống

5. **Ngưỡng Quyết Định** (tùy chọn)
   - Số từ 0-1
   - Mặc định: `0.5`
   - Giá trị cao hơn → Cảnh báo ít hơn
   - Giá trị thấp hơn → Cảnh báo nhiều hơn

#### Tải Lên Files:

**⚠️ Lưu ý:** Files sẽ được lưu với tên chuẩn trong hệ thống (tên gốc của file không quan trọng).

1. **File Model (.pkl)** (bắt buộc)
   - Chọn file: Kéo thả hoặc click
   - File phải là `.pkl` hoặc `.joblib`
   - Ví dụ tên: `logistic_student_model.pkl`, `model.pkl`, `student_model.pkl`, ...
   - **Lưu lại trong hệ thống as:** `logistic_student_model.pkl`

2. **File Scaler (.pkl)** (bắt buộc)
   - Chọn file: Kéo thả hoặc click
   - File phải là `.pkl` hoặc `.joblib`
   - Ví dụ tên: `scaler_student.pkl`, `scaler.pkl`, ...
   - **Lưu lại trong hệ thống as:** `scaler_student.pkl`

3. **File Config (.pkl)** (tùy chọn)
   - Chọn file: Kéo thả hoặc click
   - File phải là `.pkl` hoặc `.joblib`
   - Ví dụ tên: `model_config.pkl`, `config.pkl`, ...
   - Chứa: danh sách features, ngưỡng tối ưu, hyperparameters, v.v.
   - **Lưu lại trong hệ thống as:** `model_config.pkl`

#### Submit:

Click **"📤 Tải Model Lên Hệ Thống"**

- Hệ thống sẽ upload files
- Nếu thành công: Hiện thông báo ✅ "Tải model thành công!"
- Form sẽ reset tự động
- Danh sách models sẽ cập nhật

### Bước 3: Xem Danh Sách Môn Học

**Tab: 📋 Danh Sách Môn Học**

Liệt kê tất cả môn học có mô hình đã upload:

```
┌─────────────────────────────────────┐
│ Môn Toán (math)                     │
├─────────────────────────────────────┤
│ Phiên Bản: 1.0                      │
│ Độ Chính Xác: 85%                   │
│ Ngưỡng: 0.55                        │
│ Ngày Huấn Luyện: 17/4/2026          │
├─────────────────────────────────────┤
│ [👁️ Chi Tiết] [🗑️ Xóa]              │
└─────────────────────────────────────┘
```

### Bước 4: Xem Chi Tiết Mô Hình

Từ danh sách, click **"👁️ Chi Tiết"**

Sẽ hiển thị:
- Subject ID
- Subject Name
- Version
- Accuracy
- Threshold
- Trained Date
- File names

### Bước 5: Xóa Mô Hình Môn

Từ danh sách, click **"🗑️ Xóa"**

- Sẽ hỏi xác nhận
- Nếu xóa: Model sẽ bị xóa vĩnh viễn
- Danh sách sẽ cập nhật

## 📱 Ví Dụ Thực Tế

### Ví dụ 1: Upload Mô Hình Toán

```
📤 Tải Mô Hình Môn Mới
├─ ID Môn Học: math
├─ Tên Môn Học: Môn Toán
├─ Phiên Bản: 1.0
├─ Độ Chính Xác: 87.5 %
├─ Ngưỡng: 0.52
├─ [Kéo thả model.pkl]
├─ [Kéo thả scaler.pkl]
└─ [Tải Model Lên Hệ Thống]

→ Upload
✅ Tải mô hình cho "Môn Toán" thành công!
```

### Ví dụ 2: Upload Mô Hình Tiếng Anh

```
📤 Tải Mô Hình Môn Mới
├─ ID Môn Học: english
├─ Tên Môn Học: Tiếng Anh
├─ Phiên Bản: 2.0 (retrained)
├─ Độ Chính Xác: 84.2 %
├─ Ngưỡng: 0.50
├─ [Kéo thả model.pkl]
├─ [Kéo thả scaler.pkl]
└─ [Tải Model Lên Hệ Thống]

→ Upload
✅ Tải mô hình cho "Tiếng Anh" thành công!
```

## 🎨 UI Components

### Tab Navigation
- 📤 **Tải Mô Hình Môn Mới** - Upload form
- 📋 **Danh Sách Môn Học** - List view

### Buttons
- **📤 Tải Model Lên Hệ Thống** - Submit upload
- **👁️ Chi Tiết** - View model details
- **🗑️ Xóa** - Delete model

### Notifications
- ✅ Thành công (xanh lá)
- ❌ Lỗi (đỏ)
- ℹ️ Thông tin (xanh dương)

## ⚠️ Lưu Ý

1. **File Format**
   - Chỉ accept `.pkl` hoặc `.joblib`
   - Kiểm tra trước khi upload
   - File phải từ Colab hoặc Python environment

2. **Subject Naming**
   - `subject_id` không thể trùng (unique)
   - Dùng `snake_case`: `math`, `english`, `physics`
   - Không dùng: `Math`, `ENGLISH`, `dữ liệu-khoa học`

3. **Accuracy & Threshold**
   - Accuracy: 0-100 (%)
   - Threshold: 0-1 (decimal)
   - Nếu không biết, để trống (sẽ lấy default)

4. **Phiên Bản**
   - Khi retrain same subject, tăng version
   - Ví dụ: 1.0 → 1.1 → 1.2 → 2.0
   - Để track history các version

## 🔗 Liên Quan

- [Model Management Backend](../backend/MODEL_MANAGEMENT.md)
- [API Endpoints](../backend/routes/api.py#model-management)

### Troubleshooting

### "File phải là .pkl hoặc .joblib"
→ Kiểm tra đuôi file, đảm bảo là `.pkl` không phải `.pckl` hay `/pkl`

### "Chưa có mô hình nào được tải lên"
→ Upload mô hình đầu tiên từ tab "Tải Mô Hình Môn Mới"

### Upload thất bại
→ Kiểm tra:
- File size quá lớn?
- Connection ổn định?
- Field required đã điền?
- Server backend chạy?

### Mô hình không xuất hiện trong danh sách
→ Reload page hoặc chuyển tab rồi quay lại
