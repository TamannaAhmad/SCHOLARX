import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)

class ChatbotConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'chatbot'
    
    def ready(self):
        """Django app initialization - chatbot service will be lazy-loaded on first use."""
        logger.info("ChatbotConfig ready. Chatbot service will be initialized on first use (lazy-loading).")