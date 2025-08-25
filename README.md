# ScholarX - AI-Driven Student Collaboration Platform

ScholarX is an intelligent student collaboration platform that connects learners for academic teamwork using advanced NLP, recommendation systems, and scheduling algorithms.

## 🚀 Features

- **Smart Team Formation**: Automatic teammate recommendation based on schedule compatibility
- **Advanced Scheduling Algorithm**: Intelligent matching using available/avoid time slot logic
- **Flexible Team Sizing**: Users specify desired team size, algorithm finds optimal matches
- **Multi-format Data Support**: Load schedule data from CSV or Excel files
- **Time Slot Management**: 8 daily time slots covering 24-hour availability
- **Cross-platform Compatibility**: Works on Windows, macOS, and Linux

## 🏗️ Project Structure

```
SCHOLARX/
├── Scheduler                    # Main scheduling algorithm implementation
├── Cleaned_ScholarX_Data_NoConflicts.xlsx  # Sample data file
├── README.md                   # This file
└── .gitignore                 # Git ignore patterns
```

## 🛠️ Technology Stack

- **Python 3.7+**: Core programming language
- **Pandas**: Data manipulation and analysis
- **Pathlib**: Cross-platform path handling
- **Collections**: Advanced data structures
- **Typing**: Type hints for better code quality

## 📋 Prerequisites

- Python 3.7 or higher
- pip (Python package installer)
- Git (for version control)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd "Scheduling Algorithm/SCHOLARX"
   ```

2. **Install required dependencies**
   ```bash
   pip install pandas openpyxl
   ```

3. **Verify installation**
   ```bash
   python -c "import pandas; print('Installation successful!')"
   ```

## 📖 Usage

### Basic Usage

The scheduling algorithm automatically finds optimal team matches based on schedule compatibility:

```python
from Scheduler import AutoRecommendScheduleMatcher

# Initialize the scheduler
scheduler = AutoRecommendScheduleMatcher()

# Load schedule data from file
scheduler.load_from_file("Cleaned_ScholarX_Data_NoConflicts.xlsx")

# Find team matches (e.g., teams of 3)
teams = scheduler.find_teams(team_size=3)
```

### Data Format

Your Excel/CSV file should contain:
- **Name/ID columns**: Student identification
- **Time slot columns**: Availability for each day and time slot
- **Format**: Available time slots marked as "Available", unavailable as "Avoid"

### Supported File Formats

- `.xlsx` (Excel 2007+)
- `.xls` (Excel 97-2003)
- `.csv` (Comma-separated values)

## 🧮 Algorithm Details

The scheduling algorithm uses:

1. **Time Slot Analysis**: 8 daily time slots from 09:00 to 23:00
2. **Compatibility Scoring**: Calculates match scores based on overlapping availability
3. **Optimal Team Formation**: Uses greedy algorithm to form teams with highest compatibility
4. **Conflict Resolution**: Automatically handles scheduling conflicts

## 📊 Sample Data

The project includes a sample Excel file (`Cleaned_ScholarX_Data_NoConflicts.xlsx`) demonstrating the expected data format for testing and development.

## 🔍 Key Classes

### `AutoRecommendScheduleMatcher`

Main class providing:
- `load_from_file()`: Load schedule data from files
- `find_teams()`: Generate optimal team formations
- `get_user_schedule()`: Retrieve individual user schedules
- `calculate_compatibility()`: Score compatibility between users

## 🧪 Testing

To test the scheduler:

```python
# Load sample data
scheduler = AutoRecommendScheduleMatcher()
scheduler.load_from_file("Cleaned_ScholarX_Data_NoConflicts.xlsx")

# Test team formation
teams = scheduler.find_teams(team_size=3)
print(f"Generated {len(teams)} teams")
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is part of a Final Year Project in AI and Data Science Engineering.

## 👥 Authors

- **ScholarX Team** - *Initial work* - [ScholarX](https://github.com/scholarx)


## 📞 Support

For questions or support:
- Create an issue in the repository
- Contact the development team
- Refer to the project documentation

---

**Note**: This is a project implementing advanced scheduling algorithms for educational collaboration. The algorithm is designed to optimize team formation based on schedule compatibility while maintaining academic integrity.
