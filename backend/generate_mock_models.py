import os
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
import lightgbm as lgb

# Đảm bảo thư mục models tồn tại
os.makedirs('models', exist_ok=True)

# Tạo dữ liệu giả định để train mock models
# Các features: active_days, login_count, video_views, document_reads, discussion, assignment_attempt, assignment_time
np.random.seed(42)
X_mock = np.random.rand(100, 7) * 100
# Target: 0 (Safe) hoặc 1 (Risk)
y_mock = np.random.randint(0, 2, 100)

# Scaler
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_mock)
joblib.dump(scaler, 'models/scaler.pkl')

# Logistic Regression
lr_model = LogisticRegression(random_state=42)
lr_model.fit(X_scaled, y_mock)
joblib.dump(lr_model, 'models/logistic_regression.pkl')

# Random Forest
rf_model = RandomForestClassifier(n_estimators=10, random_state=42)
rf_model.fit(X_scaled, y_mock)
joblib.dump(rf_model, 'models/random_forest.pkl')

# LightGBM
lgb_model = lgb.LGBMClassifier(n_estimators=10, random_state=42)
lgb_model.fit(X_scaled, y_mock)
joblib.dump(lgb_model, 'models/lightgbm.pkl')

print("Mock models & scaler generated successfully in 'models/' directory!")
