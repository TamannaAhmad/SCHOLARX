import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)

class ChatbotConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'chatbot'
    
    def ready(self):
        """Initialize the chatbot service when Django starts."""
        if hasattr(self, '_initialized'):
            return
            
        self._initialized = True
        logger.info("Initializing ChatbotConfig...")
        
        try:
            # Try to import the chatbot service
            from .services import chatbot_service
            logger.info("Successfully imported chatbot service")
            
            if not chatbot_service.available:
                logger.error("Chatbot service is not available")
                print("Warning: Chatbot service is not available. Check logs for details.")
            else:
                logger.info("Chatbot service is available and ready")
                print("Chatbot service initialized successfully")
                
        except ImportError as e:
            error_msg = f"Failed to import chatbot service: {e}"
            logger.error(error_msg)
            print(error_msg)
            
        except Exception as e:
            error_msg = f"Error initializing chatbot service: {e}"
            logger.error(error_msg, exc_info=True)
            print(error_msg)