CREATE TABLE sample_users (
    usn VARCHAR(10) PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    department VARCHAR(100) NOT NULL,
    year INTEGER CHECK (year BETWEEN 1 AND 4) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sample_user_skills (
    usn VARCHAR(10) REFERENCES sample_users(USN) ON DELETE CASCADE,
    skill_id INTEGER REFERENCES skills(skill_id) ON DELETE CASCADE,
    proficiency_level integer not null default 3,
    CONSTRAINT chk_proficiency_level CHECK (
        (
            (proficiency_level >= 0)
            AND (proficiency_level <= 5)
        )
    ),
    PRIMARY KEY (usn, skill_id, proficiency_level)
);

CREATE TABLE sample_user_availability (
    id SERIAL PRIMARY KEY,
    usn VARCHAR(10) REFERENCES sample_users(usn) ON DELETE CASCADE,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday, 6=Saturday
    time_slot_start TIME WITHOUT TIME ZONE NOT NULL,
    time_slot_end TIME WITHOUT TIME ZONE NOT NULL,
    is_available BOOLEAN NOT NULL,
    UNIQUE(usn, day_of_week, time_slot_start, time_slot_end)
);

CREATE TABLE skills (
    skill_id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);