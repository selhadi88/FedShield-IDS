import logging
import json
import datetime
import os

LOGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)

LOG_FILE = os.path.join(LOGS_DIR, 'audit.log')

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            "timestamp": datetime.datetime.fromtimestamp(record.created).isoformat() + "Z",
            "actor_id": getattr(record, "actor_id", "system-auto"),
            "event_type": getattr(record, "event_type", "SYSTEM_EVENT"),
            "targeted_device_id": getattr(record, "targeted_device_id", "none"),
            "security_verdict": getattr(record, "security_verdict", "INFO")
        }
        if record.getMessage():
            log_record["message"] = record.getMessage()
        return json.dumps(log_record)

logger = logging.getLogger("FedShieldAudit")
logger.setLevel(logging.INFO)

# Prevent log messages from propagating to the root logger to avoid duplicates
logger.propagate = False

file_handler = logging.FileHandler(LOG_FILE)
file_handler.setFormatter(JSONFormatter())

# Clear any existing handlers
if logger.hasHandlers():
    logger.handlers.clear()
    
logger.addHandler(file_handler)

def log_audit_event(event_type: str, actor_id: str, targeted_device_id: str, security_verdict: str, message: str = ""):
    """Helper method for structured logging."""
    extra = {
        "event_type": event_type,
        "actor_id": actor_id,
        "targeted_device_id": targeted_device_id,
        "security_verdict": security_verdict
    }
    logger.info(message, extra=extra)

if __name__ == "__main__":
    log_audit_event("TEST_EVENT", "admin", "smart_lock", "SUCCESS", "Testing the JSON logger format.")
    print(f"Log test written to {LOG_FILE}")
