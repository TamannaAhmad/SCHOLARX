from django.urls import path
from . import views

urlpatterns = [
    path('ask', views.chatbot_ask, name='chatbot_ask'),
]