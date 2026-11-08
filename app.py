import os
from datetime import date, timedelta

import mysql.connector
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

DB_CONFIG = {
    "host": os.getenv("MYSQL_HOST", "localhost"),
    "user": os.getenv("MYSQL_USER", "root"),
    "password": os.getenv("MYSQL_PASSWORD", ""),
    "database": os.getenv("MYSQL_DB", "studentflow"),
}

STATUSES = ("pending", "in_progress", "review", "completed")


def run(sql, params=(), fetch=False):
    """Run a query on a fresh connection. Returns rows for SELECT, lastrowid otherwise."""
    conn = mysql.connector.connect(**DB_CONFIG)
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(sql, params)
        if fetch:
            return cur.fetchall()
        conn.commit()
        return cur.lastrowid
    finally:
        cur.close()
        conn.close()


# ---------- Page ----------

@app.route("/")
def index():
    return render_template("index.html")


# ---------- Schedule: timetable ----------

@app.route("/api/courses", methods=["GET", "POST"])
def courses():
    if request.method == "POST":
        d = request.get_json(force=True)
        new_id = run(
            "INSERT INTO courses (name, room, instructor, day_of_week, start_time, end_time) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (d["name"], d.get("room", ""), d.get("instructor", ""),
             int(d["day_of_week"]), d["start_time"], d["end_time"]),
        )
        return jsonify(id=new_id), 201

    rows = run(
        """SELECT id, name, room, instructor, day_of_week,
                  TIME_FORMAT(start_time, '%H:%i') AS start_time,
                  TIME_FORMAT(end_time, '%H:%i')   AS end_time
           FROM courses ORDER BY day_of_week, start_time""",
        fetch=True,
    )
    return jsonify(rows)


# ---------- Schedule: pending syllabus ----------

@app.route("/api/syllabus", methods=["GET", "POST"])
def syllabus():
    if request.method == "POST":
        d = request.get_json(force=True)
        done = 1 if str(d.get("completed", "0")) in ("1", "true", "True") else 0
        new_id = run(
            "INSERT INTO syllabus_topics (course_name, topic, completed) VALUES (%s, %s, %s)",
            (d["course_name"], d["topic"], done),
        )
        return jsonify(id=new_id), 201

    rows = run(
        """SELECT course_name,
                  CAST(SUM(completed) AS SIGNED) AS done,
                  CAST(COUNT(*) AS SIGNED)       AS total
           FROM syllabus_topics GROUP BY course_name ORDER BY course_name""",
        fetch=True,
    )
    return jsonify(rows)


# ---------- Schedule: exams ----------

@app.route("/api/exams", methods=["GET", "POST"])
def exams():
    if request.method == "POST":
        d = request.get_json(force=True)
        new_id = run(
            "INSERT INTO exams (course_name, title, exam_date) VALUES (%s, %s, %s)",
            (d["course_name"], d["title"], d["exam_date"]),
        )
        return jsonify(id=new_id), 201

    rows = run(
        """SELECT id, course_name, title, DATE_FORMAT(exam_date, '%Y-%m-%d') AS exam_date
           FROM exams WHERE exam_date >= CURDATE() ORDER BY exam_date""",
        fetch=True,
    )
    return jsonify(rows)


# ---------- Assignments ----------

@app.route("/api/assignments", methods=["GET", "POST"])
def assignments():
    if request.method == "POST":
        d = request.get_json(force=True)
        priority = d.get("priority", "medium")
        if priority not in ("high", "medium", "low"):
            raise ValueError("priority")
        new_id = run(
            "INSERT INTO assignments (title, course_name, deadline, priority) VALUES (%s, %s, %s, %s)",
            (d["title"], d.get("course_name", ""), d["deadline"], priority),
        )
        return jsonify(id=new_id), 201

    rows = run(
        """SELECT id, title, course_name, priority, status,
                  DATE_FORMAT(deadline, '%Y-%m-%d') AS deadline
           FROM assignments ORDER BY deadline, id""",
        fetch=True,
    )
    return jsonify(rows)


@app.route("/api/assignments/<int:aid>", methods=["PATCH", "DELETE"])
def assignment(aid):
    if request.method == "DELETE":
        run("DELETE FROM assignments WHERE id = %s", (aid,))
        return jsonify(ok=True)

    status = request.get_json(force=True)["status"]
    if status not in STATUSES:
        raise ValueError("status")
    run("UPDATE assignments SET status = %s WHERE id = %s", (status, aid))
    return jsonify(ok=True)


# ---------- Study monitor ----------

@app.route("/api/study/sessions", methods=["POST"])
def log_session():
    d = request.get_json(force=True)
    seconds = int(d["duration_seconds"])
    if seconds <= 0:
        raise ValueError("duration_seconds")
    run(
        "INSERT INTO study_sessions (subject, session_date, duration_seconds) VALUES (%s, %s, %s)",
        ((d.get("subject") or "General Study").strip(), date.today(), seconds),
    )
    return jsonify(ok=True), 201


@app.route("/api/study/summary")
def study_summary():
    today = date.today()
    start = today - timedelta(days=6)
    rows = run(
        """SELECT DATE_FORMAT(session_date, '%Y-%m-%d') AS d,
                  CAST(SUM(duration_seconds) AS SIGNED) AS s
           FROM study_sessions WHERE session_date >= %s GROUP BY session_date""",
        (start,),
        fetch=True,
    )
    by_day = {r["d"]: r["s"] for r in rows}
    daily = []
    for i in range(7):
        key = (start + timedelta(days=i)).isoformat()
        daily.append({"date": key, "seconds": by_day.get(key, 0)})
    return jsonify(
        today=by_day.get(today.isoformat(), 0),
        week=sum(day["seconds"] for day in daily),
        daily=daily,
    )


# ---------- Error handling ----------

@app.errorhandler(KeyError)
@app.errorhandler(ValueError)
def bad_request(err):
    return jsonify(error=f"Missing or invalid field: {err}"), 400


@app.errorhandler(mysql.connector.Error)
def database_error(err):
    return jsonify(error=f"Database error: {err}"), 500


if __name__ == "__main__":
    app.run(debug=True)
