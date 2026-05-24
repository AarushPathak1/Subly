"""
Patch external dependencies before any test module imports main.
"""
import os
import sys
from unittest.mock import MagicMock

os.environ.setdefault("OPENAI_API_KEY", "sk-test-fake")
os.environ.setdefault("PINECONE_API_KEY", "test-pinecone-key")
os.environ.setdefault("PINECONE_INDEX", "subly-listings")
os.environ.setdefault("DATABASE_URL", "postgresql://subly:subly_secret@localhost:5432/subly")
os.environ.setdefault("RABBITMQ_URL", "amqp://subly:subly_secret@localhost:5672")

mock_conn = MagicMock()
mock_cursor = MagicMock()
mock_conn.cursor.return_value = mock_cursor
mock_psycopg2 = MagicMock()
mock_psycopg2.connect.return_value = mock_conn
sys.modules["psycopg2"] = mock_psycopg2

sys.modules["openai"] = MagicMock()
sys.modules["aio_pika"] = MagicMock()

# Pinecone: pc.Index(...) must return an object with .upsert() and .query()
mock_index = MagicMock()
mock_pinecone_module = MagicMock()
mock_pinecone_module.Pinecone.return_value.Index.return_value = mock_index
sys.modules["pinecone"] = mock_pinecone_module
