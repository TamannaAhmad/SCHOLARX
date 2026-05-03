# SCHOLARX - Academic Collaboration Platform

A comprehensive web application designed to connect students for collaborative learning, project development, and academic success. SCHOLARX enables students to find compatible study partners, create and join study groups, manage projects, and leverage AI-powered assistance for their academic journey.

## 🚀 Features

### Core Functionality
- **User Authentication & Profiles**: Secure registration, login, and comprehensive user profiles with academic information
- **Smart Team Matching**: Advanced algorithm-based matching of students based on skills, interests, and academic goals
- **Project Management**: Create, manage, and collaborate on academic projects with team members
- **Study Groups**: Form and manage study groups with meeting scheduling and coordination
- **AI Chatbot**: Intelligent assistant powered by Google Gemini for academic guidance
- **Meeting Scheduler**: Integrated meeting slot management
- **Skill Assessment**: Comprehensive skill tracking and proficiency matching

### Technical Features
- **RESTful API**: Django REST Framework backend with comprehensive API endpoints
- **Responsive Design**: Modern, mobile-friendly frontend with vanilla JavaScript
- **Real-time Updates**: Dynamic UI updates without page refreshes
- **Secure Authentication**: JWT tokens and session-based authentication
- **Database Integration**: PostgreSQL database with optimized queries

## 📁 Project Structure

```
SCHOLARX/
├── webapp/                    # Main web application
│   ├── backend/              # Django REST Framework API
│   │   ├── accounts/         # User authentication and profiles
│   │   ├── projects/         # Project and group management
│   │   ├── chatbot/          # AI-powered chatbot service
│   │   └── scholarx_backend/ # Core Django settings and configuration
│   └── frontend/             # Vanilla JavaScript frontend
│       ├── scripts/          # JavaScript modules for each feature
│       ├── styles/           # CSS styling and responsive design
│       └── [HTML files]      # Individual page templates
├── Profile_matching/         # Advanced matching algorithms
├── chatbot/                 # AI model training and data
└── schedule_matching/       # Scheduling optimization algorithms
```

## 🛠 Technology Stack

### Backend
- **Framework**: Django 4.2.7 with Django REST Framework
- **Database**: PostgreSQL
- **Authentication**: JWT tokens (SimpleJWT) + Knox authentication
- **AI Integration**: Google Gemini API
- **Chatbot**: Sentence Transformers + FAISS for semantic search
- **Security**: CORS headers, CSRF protection, session management

### Frontend
- **Language**: Vanilla JavaScript (ES6+)
- **Styling**: CSS3 with modern layout (Grid, Flexbox)
- **Fonts**: Google Fonts (Inter, Playfair Display)
- **Architecture**: Component-based modular design
- **API Communication**: Fetch API with async/await

### Development Tools
- **Environment**: Python 3.8+, Node.js (for development tools)
- **Package Management**: pip (Python), npm (optional for frontend tools)
- **Version Control**: Git
- **Development Server**: Django's built-in server

## 🚀 Quick Start

### Prerequisites
- Python 3.8 or higher
- PostgreSQL 12 or higher
- Node.js (optional, for development tools)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd SCHOLARX
   ```

2. **Set up the backend**
   ```bash
   cd webapp/backend
   
   # Create virtual environment
   python -m venv venv
   
   # Activate virtual environment
   # Windows:
   venv\Scripts\activate
   # macOS/Linux:
   source venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   ```

3. **Configure environment variables**
   ```bash
   # Create .env file in webapp/backend/
   cp .env.example .env
   
   # Edit .env with your configuration:
   DB_NAME=SCHOLARX
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_HOST=localhost
   DB_PORT=5432
   
   # Optional: Gemini API key for chatbot
   GEMINI_API_KEY=your_gemini_api_key
   ```

4. **Set up the database**
   ```bash
   # Create database
   createdb SCHOLARX
   
   # Run migrations
   python manage.py migrate
   
   # Create superuser (optional)
   python manage.py createsuperuser
   ```

5. **Start the development server**
   ```bash
   python manage.py runserver
   ```

6. **Access the application**
   - Frontend: http://127.0.0.1:8000
   - Admin Panel: http://127.0.0.1:8000/admin/
   - API Documentation: http://127.0.0.1:8000/api/

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register/` - User registration
- `POST /api/auth/login/` - User login
- `POST /api/auth/logout/` - User logout
- `GET /api/auth/user/` - Get current user profile
- `PUT /api/auth/user/` - Update user profile

### Project Endpoints
- `GET /api/projects/` - List all projects
- `POST /api/projects/` - Create new project
- `GET /api/projects/{id}/` - Get project details
- `PUT /api/projects/{id}/` - Update project
- `DELETE /api/projects/{id}/` - Delete project

### Study Group Endpoints
- `GET /api/projects/groups/` - List study groups
- `POST /api/projects/groups/` - Create study group
- `POST /api/projects/groups/{id}/join/` - Join study group
- `POST /api/projects/groups/{id}/leave/` - Leave study group

### Chatbot Endpoints
- `POST /api/chatbot/chat/` - Send message to AI chatbot

### Matching Endpoints
- `GET /api/projects/find-teammates/` - Find compatible teammates
- `POST /api/projects/advanced-matching/` - Advanced skill-based matching

## 🎯 Core Features Explained

### Smart Matching Algorithm
The platform uses advanced matching algorithms that consider:
- **Skill Compatibility**: Overlap and complementarity of technical skills
- **Academic Goals**: Similar learning objectives and project interests
- **Availability**: Matching schedules and time zones
- **Proficiency Levels**: Balancing expertise levels for optimal collaboration

### AI Chatbot Integration
- **Powered by Google Gemini**: Advanced natural language processing
- **Academic Context**: Specialized in educational content and guidance
- **Semantic Search**: FAISS-based vector search for relevant responses
- **Knowledge Base**: Trained on academic materials and study resources

## 🔧 Configuration

### Environment Variables
Create a `.env` file in `webapp/backend/` with the following variables:

```bash
# Database Configuration
DB_NAME=SCHOLARX
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432

# API Keys
GEMINI_API_KEY=your_gemini_api_key

# Email Configuration (Optional)
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=your_email@gmail.com
EMAIL_HOST_PASSWORD=your_app_password

# Frontend URLs
FRONTEND_URL=http://localhost:3000
FRONTEND_BASE_URL=http://localhost:8000
```

### Security Settings
For production deployment, ensure:
- `DEBUG = False`
- `SECRET_KEY` is set to a secure, random value
- `ALLOWED_HOSTS` includes your production domain
- HTTPS is enabled with proper SSL certificates
- Database credentials are secured

## 🧪 Testing

### Running Tests
```bash
# Run all tests
python manage.py test

# Run specific app tests
python manage.py test accounts
python manage.py test projects
python manage.py test chatbot

# Run with coverage (if coverage.py is installed)
coverage run --source='.' manage.py test
coverage report
```

### Test Coverage
- Unit tests for models, views, and serializers
- Integration tests for API endpoints
- Authentication flow testing
- Matching algorithm validation

## 🚀 Deployment

### Production Setup

1. **Environment Configuration**
   - Set production environment variables
   - Configure PostgreSQL database
   - Set up Redis for caching (optional)

2. **Static Files**
   ```bash
   python manage.py collectstatic --noinput
   ```

3. **Database Migration**
   ```bash
   python manage.py migrate
   ```

4. **Web Server**
   - Use Gunicorn for WSGI serving
   - Configure Nginx as reverse proxy
   - Set up SSL certificates

5. **Process Management**
   - Use systemd or supervisor for process management
   - Configure automatic restarts

### Docker Deployment
```dockerfile
# Dockerfile example
FROM python:3.9
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "scholarx_backend.wsgi:application"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Follow PEP 8 for Python code
- Use ESLint standards for JavaScript
- Write meaningful commit messages
- Add tests for new features
- Update documentation

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Check the documentation
- Review existing issues and discussions

---

**SCHOLARX** - Empowering collaborative learning and academic excellence through technology.
