from django.db.models.signals import post_migrate
from django.dispatch import receiver
from accounts.models import Department, Skill

def add_test_departments():
    # List of departments to add
    departments = [
        'Artificial Intelligence and Data Science',
        'Civil Engineering',
        'Computer Science and Business Systems',
        'Computer Science and Engineering',
        'Electronics and Communication Engineering',
        'Mechanical Engineering',
    ]
    
    # Add departments if they don't exist
    for dept_name in departments:
        Department.objects.get_or_create(name=dept_name)
    
    print(f"Added {len(departments)} departments to the database.")

def add_test_skills():
    # List of skills from your SQL script
    skills = [
        'Python', 'JavaScript', 'Java', 'C++', 'C#', 'Go', 'Rust', 'TypeScript',
        'Swift', 'Kotlin', 'Ruby', 'PHP', 'SQL', 'R', 'MATLAB', 'Dart', 'Scala',
        'HTML5', 'CSS3', 'React', 'Angular', 'Vue.js', 'Node.js', 'Express.js',
        'Django', 'Flask', 'Spring Boot', 'ASP.NET', 'Ruby on Rails', 'Laravel',
        'Machine Learning', 'Deep Learning', 'Neural Networks', 'Computer Vision',
        'Natural Language Processing', 'Reinforcement Learning', 'Data Mining',
        'Data Visualization', 'Big Data', 'Hadoop', 'Spark', 'TensorFlow', 'PyTorch',
        'Keras', 'scikit-learn', 'OpenCV', 'NLTK', 'spaCy', 'Transformers',
        'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'Oracle', 'Cassandra',
        'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform',
        'CI/CD', 'Jenkins', 'GitHub Actions', 'Ansible', 'Linux', 'Bash Scripting',
        'Embedded Systems', 'Arduino', 'Raspberry Pi', 'VLSI', 'FPGA', 'Verilog',
        'VHDL', 'PCB Design', 'Circuit Design', 'Signal Processing', 'IoT',
        'CAD', 'SolidWorks', 'AutoCAD', 'ANSYS', 'Finite Element Analysis',
        'Thermodynamics', 'Fluid Mechanics', 'Mechatronics', 'Robotics',
        'AutoCAD Civil 3D', 'Revit', 'STAAD.Pro', 'ETABS', 'Construction Management',
        'Structural Analysis', 'Environmental Engineering', 'Transportation Engineering',
        'Project Management', 'Agile', 'Scrum', 'Leadership', 'Communication',
        'Problem Solving', 'Critical Thinking', 'Teamwork', 'Time Management'
    ]
    
    # Add skills if they don't exist
    added_count = 0
    for skill_name in skills:
        skill, created = Skill.objects.get_or_create(name=skill_name)
        if created:
            added_count += 1
    
    print(f"Added {added_count} new skills to the database.")

@receiver(post_migrate)
def on_post_migrate(sender, **kwargs):
    """
    Signal handler to add test data after migrations
    """
    # Only run for the accounts app
    if sender.name == 'accounts':
        add_test_departments()
        add_test_skills()
