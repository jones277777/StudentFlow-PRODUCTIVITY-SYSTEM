CREATE DATABASE IF NOT EXISTS studentflow;
USE studentflow;

-- Schedule module: weekly timetable (day_of_week: 1 = Mon ... 7 = Sun)
CREATE TABLE IF NOT EXISTS courses (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(120) NOT NULL,
    room        VARCHAR(80)  DEFAULT '',
    instructor  VARCHAR(80)  DEFAULT '',
    day_of_week TINYINT      NOT NULL,
    start_time  TIME         NOT NULL,
    end_time    TIME         NOT NULL
);

-- Schedule module: pending syllabus topics per course
CREATE TABLE IF NOT EXISTS syllabus_topics (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    course_name VARCHAR(120) NOT NULL,
    topic       VARCHAR(200) NOT NULL,
    completed   TINYINT(1)   NOT NULL DEFAULT 0
);

-- Schedule module: upcoming exams
CREATE TABLE IF NOT EXISTS exams (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    course_name VARCHAR(120) NOT NULL,
    title       VARCHAR(120) NOT NULL,
    exam_date   DATE         NOT NULL
);

-- Assignments module: name, deadline, priority and status
CREATE TABLE IF NOT EXISTS assignments (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(200) NOT NULL,
    course_name VARCHAR(120) DEFAULT '',
    deadline    DATE         NOT NULL,
    priority    ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'medium',
    status      ENUM('pending', 'in_progress', 'review', 'completed') NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- Study monitor module: time spent studying, one row per session
CREATE TABLE IF NOT EXISTS study_sessions (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    subject          VARCHAR(120) NOT NULL,
    session_date     DATE         NOT NULL,
    duration_seconds INT          NOT NULL,
    created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);
