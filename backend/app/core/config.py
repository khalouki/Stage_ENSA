from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "Virtual FabLab API"
    app_version: str = "1.0.0"
    secret_key: str = "CHANGE_ME_IN_PRODUCTION"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 8
    student_email_domain: str = "usms.ac.ma"
    database_url: str = "sqlite:///./fablab.db"
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://192.168.137.131:3000",
    ]
    cors_origin_regex: str = (
        r"https?://("
        r"localhost|127\.0\.0\.1|"
        r"10\.\d{1,3}\.\d{1,3}\.\d{1,3}|"
        r"172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|"
        r"192\.168\.\d{1,3}\.\d{1,3}"
        r")(:\d+)?"
    )
    telemetry_dataset_path: str = "data/machine_telemetry_demo.csv"
    mqtt_enabled: bool = True
    mqtt_host: str = "localhost"
    mqtt_port: int = 1883
    mqtt_topic_pattern: str = "fablab/machines/+/data"


settings = Settings()
