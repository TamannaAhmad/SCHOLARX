CREATE TABLE users (
    usn VARCHAR(10) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    department VARCHAR(50) NOT NULL,
    study_year INTEGER NOT NULL,
    CREATED_AT TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT users_year_check CHECK ((study_year >= 1) AND (study_year <= 4))
);

CREATE TABLE skills (
    skill_id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE user_skills (
    id SERIAL PRIMARY KEY,
    usn VARCHAR(10) REFERENCES users(usn) ON DELETE CASCADE,
    skill_id INTEGER REFERENCES skills(skill_id) ON DELETE CASCADE NOT NULL,
    proficiency_level INTEGER NOT NULL DEFAULT 3,
    CONSTRAINT chk_proficiency_level CHECK (proficiency_level BETWEEN 0 AND 5),
    UNIQUE(usn, skill_id)
);

CREATE TABLE user_availability (
    availability_id SERIAL PRIMARY KEY,
    usn VARCHAR(10) REFERENCES users(usn) ON DELETE CASCADE,
    day_of_week SMALLINT CHECK (day_of_week BETWEEN 0 AND 6),  
    time_slot_start TIME WITH TIME ZONE NOT NULL,
    time_slot_end TIME WITH TIME ZONE NOT NULL,
    is_available BOOLEAN NOT NULL,
    UNIQUE(usn, day_of_week, time_slot_start, time_slot_end)
);