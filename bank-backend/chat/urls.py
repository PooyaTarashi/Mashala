from django.urls import path
from .views import ChatProcessView

app_name = 'chat'

urlpatterns = [
    path('process/', ChatProcessView.as_view(), name='chat-process'),
]