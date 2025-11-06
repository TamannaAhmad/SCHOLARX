from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json
import logging
from .services import chatbot_service

logger = logging.getLogger(__name__)

@csrf_exempt
@require_http_methods(["POST"])
def chatbot_ask(request):
    """
    Handle chatbot queries and return responses using the trained model
    """
    try:
        # Parse request data
        try:
            data = json.loads(request.body)
            user_message = data.get('message', '').strip()
        except json.JSONDecodeError:
            return JsonResponse({
                'status': 'error',
                'message': 'Invalid JSON format'
            }, status=400)
        
        # Validate input
        if not user_message:
            return JsonResponse({
                'status': 'error',
                'message': 'Message cannot be empty'
            }, status=400)
        
        # Get response from chatbot service
        answer, sources, found = chatbot_service.get_answer(user_message)
        
        if not found:
            return JsonResponse({
                'status': 'success',
                'response': "I'm sorry, I couldn't find a relevant answer to your question. Could you please rephrase or ask something else?",
                'sources': []
            })
        
        # Prepare response
        response_data = {
            'status': 'success',
            'response': answer,
            'sources': [{
                'text': src['text'],
                'score': src['score'],
                'metadata': src.get('metadata', {})
            } for src in sources]
        }
        
        return JsonResponse(response_data)
        
    except Exception as e:
        logger.error(f"Error in chatbot_ask: {str(e)}", exc_info=True)
        return JsonResponse({
            'status': 'error',
            'message': 'An internal server error occurred',
            'details': str(e) if settings.DEBUG else None
        }, status=500)
