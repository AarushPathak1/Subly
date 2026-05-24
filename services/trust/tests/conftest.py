"""
Patch all external dependencies before any test module imports main.
Python's import system checks sys.modules first, so replacing a module here
prevents the real psycopg2/openai packages from ever being invoked.
"""
import os
import sys
from unittest.mock import MagicMock

# Required environment variables — set before any import of main
os.environ.setdefault("OPENAI_API_KEY", "sk-test-fake")
os.environ.setdefault("DATABASE_URL", "postgresql://subly:subly_secret@localhost:5432/subly")
os.environ.setdefault("RABBITMQ_URL", "amqp://subly:subly_secret@localhost:5672")

# Replace psycopg2 so connect() at module level doesn't hit a real DB
mock_conn = MagicMock()
mock_cursor = MagicMock()
mock_conn.cursor.return_value = mock_cursor
mock_psycopg2 = MagicMock()
mock_psycopg2.connect.return_value = mock_conn
sys.modules["psycopg2"] = mock_psycopg2

# Replace openai so OpenAI() client construction doesn't fail
sys.modules["openai"] = MagicMock()

# Replace aio_pika so the RabbitMQ consumer doesn't start
sys.modules["aio_pika"] = MagicMock()
