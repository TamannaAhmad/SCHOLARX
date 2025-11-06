from django.test import TestCase, Client
from django.urls import reverse
import json

class ChatbotAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.chatbot_url = reverse('chatbot_ask')
    
    def test_chatbot_ask_valid_message(self):
        """Test chatbot response with a valid message"""
        response = self.client.post(
            self.chatbot_url,
            data=json.dumps({'message': 'Hello, chatbot!'}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data['status'], 'success')
        self.assertIn('You said: Hello, chatbot!', data['response'])
    
    def test_chatbot_ask_empty_message(self):
        """Test chatbot response with an empty message"""
        response = self.client.post(
            self.chatbot_url,
            data=json.dumps({'message': ''}),
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertEqual(data['status'], 'error')
    
    def test_chatbot_ask_invalid_json(self):
        """Test chatbot response with invalid JSON"""
        response = self.client.post(
            self.chatbot_url,
            data='invalid json',
            content_type='application/json'
        )
        self.assertEqual(response.status_code, 400)
        data = json.loads(response.content)
        self.assertEqual(data['status'], 'error')