import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard, BookOpen, CalendarDays, ClipboardList,
  GraduationCap, Plus, Check, Trash2, Target, TrendingUp,
  Menu, X, Sparkles, ChevronRight, BookMarked, Download,
  Upload, FileText, Timer, History, BarChart3, Play,
  Pause, RotateCcw, ChevronLeft, Coffee, Clock
} from "lucide-react";

import * as db from "./storage";

const STORE_NAMES = [
  "subjects", "tasks", "exams", "topics", "notes", "sessions"
];

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(value || 0));
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return hours ? `${hours}h ${remaining}m` : `${remaining}m`;
}

function App() {
  const [page, setPage] = useState("Overview");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");
  const [aiError, setAiError] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [exams, setExams] = useState([]);
  const [topics, setTopics] = useState([]);
  const [notes, setNotes] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [menu, setMenu] = useState(false);
  const importRef = useRef(null);

  const [subjectName, setSubjectName] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskSubject, setTaskSubject] = useState("");
  const [taskDate, setTaskDate] = useState("");
  const [examTitle, setExamTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [topicTitle, setTopicTitle] = useState("");
  const [topicSubject, setTopicSubject] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteSubject, setNoteSubject] = useState("");
  const [noteContent, setNoteContent] = useState("");

  // Focus timer state
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [timerPhase, setTimerPhase] = useState("focus");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [timerActive, setTimerActive] = useState(false);
  const [timerEndAt, setTimerEndAt] = useState(null);
  const [timerSubject, setTimerSubject] = useState("");
  const sessionStartedAt = useRef(null);
  const finishGuard = useRef(false);

  // Calendar state
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState(localDate());

  async function refresh() {
    const [s, t, e, tp, n, se] = await Promise.all(
      STORE_NAMES.map(name => db.getAll(name))
    );

    const subjectNameFor = id =>
      s.find(subject => subject.id === id)?.name || "General";

    setSubjects(s);
    setTasks(t.map(x => ({
      ...x,
      subject_name: subjectNameFor(x.subject_id)
    })));
    setExams(e);
    setTopics(tp);
    setNotes(n.map(x => ({
      ...x,
      subject_name: subjectNameFor(x.subject_id)
    })));
    setSessions(se.sort((a, b) =>
      new Date(b.completed_at) - new Date(a.completed_at)
    ));
    setError("");
  }

  useEffect(() => {
    async function start() {
      try {
        await db.initializeStorage();
        await refresh();
      } catch (err) {
        setError("Could not open local storage: " + err.message);
      } finally {
        setLoading(false);
      }
    }
    start();
  }, []);

  async function action(fn) {
    try {
      setError("");
      setMessage("");
      await fn();
      await refresh();
    } catch (err) {
      setError(err.message || "Something went wrong.");
    }
  }

  // Timer uses an end timestamp, so it remains accurate if the browser
  // temporarily delays background updates.
  useEffect(() => {
    if (!timerActive || !timerEndAt) return;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((timerEndAt - Date.now()) / 1000)
      );

      setSecondsLeft(remaining);

      if (remaining > 0) return;

      setTimerActive(false);
      setTimerEndAt(null);

      if (timerPhase === "focus" && !finishGuard.current) {
        finishGuard.current = true;

        const completedAt = new Date().toISOString();
        const startedAt = sessionStartedAt.current ||
          new Date(Date.now() - focusMinutes * 60000).toISOString();

        db.add("sessions", {
          subject_id: timerSubject ? Number(timerSubject) : null,
          duration_minutes: focusMinutes,
          started_at: startedAt,
          completed_at: completedAt,
          session_type: "focus"
        })
          .then(refresh)
          .then(() => setMessage(
            `Focus session completed! ${focusMinutes} minutes added to your study history.`
          ))
          .catch(err => setError("Could not save study session: " + err.message))
          .finally(() => {
            finishGuard.current = false;
          });

        sessionStartedAt.current = null;
        setTimerPhase("break");
        setSecondsLeft(breakMinutes * 60);
      } else if (timerPhase === "break") {
        setTimerPhase("focus");
        setSecondsLeft(focusMinutes * 60);
        setMessage("Break finished. Ready for another focus session?");
      }
    };

    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [
    timerActive, timerEndAt, timerPhase,
    focusMinutes, breakMinutes, timerSubject
  ]);

  function startTimer() {
    if (secondsLeft <= 0) {
      const duration = timerPhase === "focus"
        ? focusMinutes * 60
        : breakMinutes * 60;
      setSecondsLeft(duration);
    }

    if (timerPhase === "focus" && !sessionStartedAt.current) {
      sessionStartedAt.current = new Date().toISOString();
    }

    setTimerEndAt(Date.now() + Math.max(1, secondsLeft) * 1000);
    setTimerActive(true);
  }

  function pauseTimer() {
    if (timerEndAt) {
      setSecondsLeft(Math.max(
        0,
        Math.ceil((timerEndAt - Date.now()) / 1000)
      ));
    }
    setTimerActive(false);
    setTimerEndAt(null);
  }

  function resetTimer() {
    setTimerActive(false);
    setTimerEndAt(null);
    sessionStartedAt.current = null;
    setTimerPhase("focus");
    setSecondsLeft(focusMinutes * 60);
  }

  function changeFocusDuration(value) {
    const next = Math.min(180, Math.max(1, Number(value) || 25));
    setFocusMinutes(next);
    if (!timerActive && timerPhase === "focus") {
      setSecondsLeft(next * 60);
    }
  }

  function changeBreakDuration(value) {
    const next = Math.min(60, Math.max(1, Number(value) || 5));
    setBreakMinutes(next);
    if (!timerActive && timerPhase === "break") {
      setSecondsLeft(next * 60);
    }
  }

  async function addSubject(e) {
    e.preventDefault();
    if (!subjectName.trim()) return;

    await action(() => db.add("subjects", {
      name: subjectName.trim(),
      color: "#7868e6"
    }));

    setSubjectName("");
  }

  async function addTask(e) {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    await action(() => db.add("tasks", {
      title: taskTitle.trim(),
      subject_id: taskSubject ? Number(taskSubject) : null,
      due_date: taskDate || null,
      completed: false
    }));

    setTaskTitle("");
    setTaskDate("");
  }

  async function addExam(e) {
    e.preventDefault();
    if (!examTitle.trim() || !examDate) return;

    await action(() => db.add("exams", {
      title: examTitle.trim(),
      exam_date: examDate
    }));

    setExamTitle("");
    setExamDate("");
  }

  async function addTopic(e) {
    e.preventDefault();
    if (!topicTitle.trim() || !topicSubject) return;

    await action(() => db.add("topics", {
      title: topicTitle.trim(),
      subject_id: Number(topicSubject),
      completed: false
    }));

    setTopicTitle("");
  }

  async function addNote(e) {
    e.preventDefault();
    if (!noteTitle.trim()) return;

    await action(() => db.add("notes", {
      title: noteTitle.trim(),
      subject_id: noteSubject ? Number(noteSubject) : null,
      content: noteContent
    }));

    setNoteTitle("");
    setNoteContent("");
  }

  async function toggleTask(task) {
    await action(() => db.update("tasks", {
      ...task,
      completed: !task.completed
    }));
  }

  async function toggleTopic(topic) {
    await action(() => db.update("topics", {
      ...topic,
      completed: !topic.completed
    }));
  }

  async function deleteSubject(subject) {
    if (!window.confirm(
      `Delete ${subject.name}? Its topics will also be deleted. Related tasks, notes and sessions will become general items.`
    )) return;

    await action(async () => {
      await db.remove("subjects", subject.id);

      for (const topic of topics.filter(x => x.subject_id === subject.id)) {
        await db.remove("topics", topic.id);
      }

      for (const task of tasks.filter(x => x.subject_id === subject.id)) {
        await db.update("tasks", { ...task, subject_id: null });
      }

      for (const note of notes.filter(x => x.subject_id === subject.id)) {
        await db.update("notes", { ...note, subject_id: null });
      }

      for (const session of sessions.filter(x => x.subject_id === subject.id)) {
        await db.update("sessions", { ...session, subject_id: null });
      }
    });
  }

  async function exportBackup() {
    try {
      const backup = await db.exportAll();
      const blob = new Blob(
        [JSON.stringify(backup, null, 2)],
        { type: "application/json" }
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `StudyPilot-Backup-${localDate()}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setMessage("Your backup was exported successfully.");
      setError("");
    } catch (err) {
      setError("Backup failed: " + err.message);
    }
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());

      if (
        parsed.app !== "StudyPilot" ||
        parsed.formatVersion !== 1 ||
        !parsed.data ||
        !["subjects", "tasks", "exams", "topics", "notes"]
          .every(key => Array.isArray(parsed.data[key])) ||
        (parsed.data.sessions !== undefined &&
          !Array.isArray(parsed.data.sessions))
      ) {
        throw new Error("This is not a valid StudyPilot backup.");
      }

      if (!window.confirm(
        "Import this backup? It will replace the data currently stored on this device."
      )) {
        event.target.value = "";
        return;
      }

      await db.replaceAll({
        ...parsed.data,
        sessions: parsed.data.sessions || []
      });

      await refresh();
      setMessage("Backup restored successfully.");
      setError("");
    } catch (err) {
      setError("Import failed: " + err.message);
    } finally {
      event.target.value = "";
    }
  }

  const completed = tasks.filter(t => t.completed).length;
  const pending = tasks.length - completed;
  const completion = tasks.length
    ? Math.round(completed / tasks.length * 100)
    : 0;

  const topicCompleted = topics.filter(t => t.completed).length;
  const topicPercent = topics.length
    ? Math.round(topicCompleted / topics.length * 100)
    : 0;

  const totalStudyMinutes = sessions.reduce(
    (sum, session) => sum + Number(session.duration_minutes || 0), 0
  );

  async function runAiMonitor() {
    setAiLoading(true);
    setAiError("");
    setAiAnalysis("");

    try {
      const progress = {
        subjects: subjects.map(s => s.name),
        completedTasks: tasks.filter(t => t.completed).length,
        pendingTasks: tasks.filter(t => !t.completed).length,
        completedTopics: topics.filter(t => t.completed).length,
        totalTopics: topics.length,
        totalExams: exams.length,
        upcomingExams: exams
          .filter(e => e.exam_date)
          .map(e => ({
            title: e.title,
            date: e.exam_date
          })),
        studyMinutesRecorded: totalStudyMinutes,
        completionPercentage: tasks.length
          ? Math.round(tasks.filter(t => t.completed).length / tasks.length * 100)
          : 0
      };

      const response = await fetch(`${Capacitor.isNativePlatform() ? "https://studypilot-58sj.onrender.com" : ""}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ progress })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.detail || "AI analysis failed.");
      }

      setAiAnalysis(result.analysis || "No analysis was returned.");
    } catch (error) {
      setAiError(
        error.message.includes("Failed to fetch")
          ? "StudyPilot AI backend is unavailable. Start the backend on port 8010."
          : error.message
      );
    } finally {
      setAiLoading(false);
    }
  }
  const nav = [
    { name: "Overview", icon: LayoutDashboard },
    { name: "My Subjects", icon: BookOpen },
    { name: "Study Planner", icon: CalendarDays },
    { name: "Assignments", icon: ClipboardList },
    { name: "Examinations", icon: GraduationCap },
    { name: "Syllabus Tracker", icon: BookMarked },
    { name: "My Notes", icon: FileText },
    { name: "Focus Timer", icon: Timer },
    { name: "Study History", icon: History },
    { name: "Analytics", icon: BarChart3 },
    { name: "Calendar", icon: CalendarDays }
  ];

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });

  function taskList(limit) {
    const list = limit ? tasks.slice(0, limit) : tasks;

    return list.length ? list.map(task => (
      <div className="task-row" key={task.id}>
        <button
          className={"check " + (task.completed ? "checked" : "")}
          onClick={() => toggleTask(task)}
        >
          {task.completed ? <Check size={15}/> : null}
        </button>
        <div className="task-info">
          <div className={task.completed ? "task-title finished" : "task-title"}>
            {task.title}
          </div>
          <small>
            {task.subject_name || "General"}
            {task.due_date ? " Â· " + task.due_date : ""}
          </small>
        </div>
        <button className="icon-btn danger"
          onClick={() => action(() => db.remove("tasks", task.id))}>
          <Trash2 size={16}/>
        </button>
      </div>
    )) : <div className="empty">No tasks yet. Add your first study task.</div>;
  }

  function subjectList() {
    return subjects.length ? subjects.map(s => (
      <div className="subject-row" key={s.id}>
        <div className="subject-symbol" style={{ background: s.color }}>
          <BookOpen size={19}/>
        </div>
        <div className="task-info">
          <b>{s.name}</b>
          <small>
            {topics.filter(t => t.subject_id === s.id).length} syllabus topics
          </small>
        </div>
        <button className="icon-btn danger" onClick={() => deleteSubject(s)}>
          <Trash2 size={16}/>
        </button>
      </div>
    )) : <div className="empty">Add your first subject.</div>;
  }

  function renderTimer() {
    const minutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const seconds = String(secondsLeft % 60).padStart(2, "0");
    const isFocus = timerPhase === "focus";
    const progressTotal = (isFocus ? focusMinutes : breakMinutes) * 60;
    const progress = progressTotal
      ? ((progressTotal - secondsLeft) / progressTotal) * 100
      : 0;

    return (
      <section className="panel timer-panel">
        <div className="panel-heading">
          <div>
            <h2>{isFocus ? "Focus session" : "Break time"}</h2>
            <p>{isFocus ? "Give your attention to one task." : "Take a short, refreshing break."}</p>
          </div>
          {isFocus ? <Target/> : <Coffee/>}
        </div>

        <div className="timer-display">
          <div className="timer-clock">{minutes}:{seconds}</div>
          <div className="timer-phase">{isFocus ? "FOCUS MODE" : "BREAK MODE"}</div>
          <div className="timer-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, progress)}%` }}/>
          </div>
        </div>

        <div className="timer-settings">
          <label>
            Focus minutes
            <input type="number" min="1" max="180"
              value={focusMinutes}
              disabled={timerActive}
              onChange={e => changeFocusDuration(e.target.value)}/>
          </label>
          <label>
            Break minutes
            <input type="number" min="1" max="60"
              value={breakMinutes}
              disabled={timerActive}
              onChange={e => changeBreakDuration(e.target.value)}/>
          </label>
          <label className="timer-subject">
            Study subject
            <select value={timerSubject}
              disabled={timerActive}
              onChange={e => setTimerSubject(e.target.value)}>
              <option value="">General study</option>
              {subjects.map(s => (
                <option value={s.id} key={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="timer-actions">
          {!timerActive ? (
            <button className="primary" onClick={startTimer}>
              <Play size={17}/> {secondsLeft === 0 ? "Start again" : "Start"}
            </button>
          ) : (
            <button className="primary" onClick={pauseTimer}>
              <Pause size={17}/> Pause
            </button>
          )}
          <button className="secondary-btn" onClick={resetTimer}>
            <RotateCcw size={16}/> Reset
          </button>
        </div>

        <p className="timer-tip">
          Completed focus sessions are automatically saved to your Study History.
          Paused or abandoned sessions are not counted.
        </p>
      </section>
    );
  }

  function renderHistory() {
    return (
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Your study sessions</h2>
            <p>Every completed focus session is recorded here.</p>
          </div>
          <History/>
        </div>

        <div className="history-summary">
          <div><b>{sessions.length}</b><span>Sessions completed</span></div>
          <div><b>{formatMinutes(totalStudyMinutes)}</b><span>Total study time</span></div>
        </div>

        {sessions.length ? sessions.map(session => {
          const subject = subjects.find(s => s.id === session.subject_id);
          return (
            <div className="history-row" key={session.id}>
              <div className="history-icon"><Clock size={18}/></div>
              <div className="task-info">
                <b>{subject?.name || "General study"}</b>
                <small>
                  {new Date(session.completed_at).toLocaleString()}
                </small>
              </div>
              <strong>{formatMinutes(session.duration_minutes)}</strong>
              <button className="icon-btn danger"
                title="Delete session"
                onClick={() => action(() => db.remove("sessions", session.id))}>
                <Trash2 size={16}/>
              </button>
            </div>
          );
        }) : <div className="empty">No completed study sessions yet. Start your first focus session!</div>}
      </section>
    );
  }

  function renderAnalytics() {
    const lastSevenDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      const key = localDate(date);
      const minutes = sessions
        .filter(s => localDate(new Date(s.completed_at)) === key)
        .reduce((sum, s) => sum + Number(s.duration_minutes || 0), 0);

      return {
        key,
        label: date.toLocaleDateString("en-US", { weekday: "short" }),
        minutes
      };
    });

    const maxDaily = Math.max(1, ...lastSevenDays.map(d => d.minutes));

    const subjectStats = subjects.map(subject => ({
      ...subject,
      minutes: sessions
        .filter(s => s.subject_id === subject.id)
        .reduce((sum, s) => sum + Number(s.duration_minutes || 0), 0)
    })).filter(s => s.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);

    const todayMinutes = lastSevenDays[6]?.minutes || 0;
    const weekMinutes = lastSevenDays.reduce((sum, day) => sum + day.minutes, 0);

    return (
      <>
        <div className="stat-grid">
          <Stat icon={Clock} label="Total study time"
            value={formatMinutes(totalStudyMinutes)} note="Across all saved sessions" color="purple"/>
          <Stat icon={History} label="Completed sessions"
            value={sessions.length} note="Focus sessions recorded" color="blue"/>
          <Stat icon={Target} label="Today's study time"
            value={formatMinutes(todayMinutes)} note="Based on completed sessions" color="green"/>
          <Stat icon={TrendingUp} label="Last 7 days"
            value={formatMinutes(weekMinutes)} note="Weekly study total" color="orange"/>
        </div>

        <section className="panel analytics-panel">
          <div className="panel-heading">
            <div><h2>Last 7 days</h2><p>Your daily study time</p></div>
            <BarChart3/>
          </div>
          <div className="weekly-chart">
            {lastSevenDays.map(day => (
              <div className="chart-column" key={day.key}>
                <b>{formatMinutes(day.minutes)}</b>
                <div className="chart-bar-area">
                  <div className="chart-bar"
                    style={{ height: `${day.minutes ? Math.max(5, day.minutes / maxDaily * 100) : 0}%` }}/>
                </div>
                <span>{day.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div><h2>Subject-wise study time</h2><p>Time recorded against each subject</p></div>
            <BookOpen/>
          </div>
          {subjectStats.length ? subjectStats.map(subject => (
            <div className="subject-analytics" key={subject.id}>
              <div className="subject-analytics-label">
                <b>{subject.name}</b>
                <span>{formatMinutes(subject.minutes)}</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill"
                  style={{
                    width: `${subject.minutes / Math.max(1, totalStudyMinutes) * 100}%`,
                    background: subject.color || undefined
                  }}/>
              </div>
            </div>
          )) : <div className="empty">Complete a focus session with a subject selected to see subject analytics.</div>}
        </section>
      </>
    );
  }

  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const offset = (firstDay.getDay() + 6) % 7;
    const dayCount = new Date(year, month + 1, 0).getDate();
    const cellCount = Math.ceil((offset + dayCount) / 7) * 7;

    const days = Array.from({ length: cellCount }, (_, index) => {
      const dayNumber = index - offset + 1;
      if (dayNumber < 1 || dayNumber > dayCount) return null;
      return localDate(new Date(year, month, dayNumber));
    });

    const selectedTasks = tasks.filter(t => t.due_date === selectedDate);
    const selectedExams = exams.filter(e => e.exam_date === selectedDate);

    function eventsFor(date) {
      if (!date) return [];
      return [
        ...tasks.filter(t => t.due_date === date).map(t => ({ ...t, kind: "task" })),
        ...exams.filter(e => e.exam_date === date).map(e => ({ ...e, kind: "exam" }))
      ];
    }

    return (
      <>
        <section className="panel calendar-panel">
          <div className="calendar-heading">
            <button className="icon-btn" onClick={() =>
              setCalendarMonth(new Date(year, month - 1, 1))}>
              <ChevronLeft/>
            </button>
            <h2>{calendarMonth.toLocaleDateString("en-US", {
              month: "long", year: "numeric"
            })}</h2>
            <button className="icon-btn" onClick={() =>
              setCalendarMonth(new Date(year, month + 1, 1))}>
              <ChevronRight/>
            </button>
          </div>

          <div className="calendar-grid">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => (
              <div className="calendar-weekday" key={day}>{day}</div>
            ))}

            {days.map((date, index) => {
              const events = eventsFor(date);
              return (
                <button key={index}
                  disabled={!date}
                  onClick={() => date && setSelectedDate(date)}
                  className={[
                    "calendar-day",
                    !date ? "outside" : "",
                    date === selectedDate ? "selected" : "",
                    date === localDate() ? "today" : ""
                  ].join(" ")}>
                  {date ? Number(date.slice(-2)) : ""}
                  <span className="calendar-dots">
                    {events.some(e => e.kind === "task") && <i className="task-dot"/>}
                    {events.some(e => e.kind === "exam") && <i className="exam-dot"/>}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="calendar-legend">
            <span><i className="task-dot"/> Tasks / assignments</span>
            <span><i className="exam-dot"/> Examinations</span>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Events on {new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", {
                weekday: "long", month: "long", day: "numeric"
              })}</h2>
              <p>Your selected date</p>
            </div>
            <CalendarDays/>
          </div>

          {selectedTasks.map(task => (
            <div className="task-row" key={`task-${task.id}`}>
              <ClipboardList size={17}/>
              <div className="task-info">
                <b>{task.title}</b>
                <small>{task.completed ? "Completed" : "Pending"} Â· Task</small>
              </div>
              <span className="event-label task-label">Task</span>
            </div>
          ))}

          {selectedExams.map(exam => (
            <div className="task-row" key={`exam-${exam.id}`}>
              <GraduationCap size={17}/>
              <div className="task-info">
                <b>{exam.title}</b>
                <small>Examination</small>
              </div>
              <span className="event-label exam-label">Exam</span>
            </div>
          ))}

          {!selectedTasks.length && !selectedExams.length && (
            <div className="empty">No tasks or examinations scheduled for this date.</div>
          )}
        </section>
      </>
    );
  }

  return (
    <div className="app-shell">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <div className="brand-icon"><GraduationCap/></div>
          <span>Study<span className="brand-light">Pilot</span></span>
          <button className="mobile-close" onClick={() => setMenu(false)}>
            <X/>
          </button>
        </div>

        <div className="nav-label">WORKSPACE</div>

        <div className="sidebar-nav-scroll">
          {nav.map(item => (
            <button key={item.name}
              onClick={() => {
                setPage(item.name);
                setMenu(false);
              }}
              className={"nav-item " + (page === item.name ? "active" : "")}>
              <item.icon size={19}/>
              <span>{item.name}</span>
              {page === item.name && <ChevronRight size={16}/>}
            </button>
          ))}
        </div>

        <div className="sidebar-bottom">
          <div className="pilot-card">
            <Sparkles size={18}/>
            <b>Study smarter.</b>
            <p>Your academic journey, organised in one place.</p>
          </div>
          <div className="version">STUDYPILOT Â· VERSION 1.1</div>
        </div>
      </aside>

      {menu && <div className="scrim" onClick={() => setMenu(false)}/>}

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenu(true)}>
            <Menu/>
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <b>{page}</b>
          </div>
          <div className="top-right">
            <span className="online-dot"/>
            <span>Local workspace</span>
            <div className="avatar">S</div>
          </div>
        </header>

        <div className="content">
          <div className="welcome">
            <div>
              <div className="eyebrow">{today}</div>
              <h1>{page === "Overview" ? "Your academic overview" : page}</h1>
              <p>Make every study session count. Keep moving forward.</p>
            </div>
            <div className="welcome-icon"><GraduationCap size={29}/></div>
          </div>

          {error && (
            <div className="error-banner">
              {error}
              <button onClick={refresh}>Retry</button>
            </div>
          )}

          {message && (
            <div className="success-banner">
              {message}
              <button onClick={() => setMessage("")}>Dismiss</button>
            </div>
          )}

          {loading ? <div className="empty">Loading your local workspace...</div> : <>
            {page === "Overview" && <>
              <section className="panel" style={{ marginBottom: 22, border: "1px solid #8b78ee" }}>
                <div className="panel-heading">
                  <div>
                    <h2><Sparkles size={19} style={{ display: "inline", marginRight: 8 }} />AI Study Monitor</h2>
                    <p>Personalised feedback based on your actual StudyPilot progress</p>
                  </div>
                  <button className="primary" onClick={runAiMonitor} disabled={aiLoading}>
                    <Sparkles size={16} />
                    {aiLoading ? "Analysing..." : "Analyse my progress"}
                  </button>
                </div>

                {aiError && (
                  <p style={{ color: "#e05252", whiteSpace: "pre-wrap" }}>{aiError}</p>
                )}

                {aiAnalysis && (
                  <div style={{
                    marginTop: 16,
                    padding: 16,
                    borderRadius: 12,
                    background: "var(--surface, rgba(120,104,230,0.08))",
                    lineHeight: 1.7,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere"
                  }}>
                    {aiAnalysis}
                  </div>
                )}

                {!aiAnalysis && !aiError && !aiLoading && (
                  <p style={{ marginTop: 12 }}>
                    Your subjects, tasks, syllabus and examination progress are ready for analysis.
                  </p>
                )}
              </section>
              <div className="stat-grid">
                <Stat icon={BookOpen} label="Total subjects"
                  value={subjects.length} note="Your learning areas" color="purple"/>
                <Stat icon={ClipboardList} label="Total study tasks"
                  value={tasks.length} note={`${pending} remaining`} color="blue"/>
                <Stat icon={Target} label="Tasks completed"
                  value={completed} note="Keep up the progress" color="green"/>
                <Stat icon={GraduationCap} label="Examinations"
                  value={exams.length} note="Stay prepared" color="orange"/>
              </div>

              <div className="dashboard-grid">
                <section className="panel task-panel">
                  <div className="panel-heading">
                    <div><h2>Study tasks</h2><p>Your academic to-do list</p></div>
                    <button className="text-btn"
                      onClick={() => setPage("Study Planner")}>
                      View all <ChevronRight size={15}/>
                    </button>
                  </div>
                  {taskList(5)}
                </section>

                <section className="panel progress-panel">
                  <div className="panel-heading">
                    <div><h2>Study progress</h2><p>Overall task completion</p></div>
                    <TrendingUp size={19}/>
                  </div>
                  <div className="progress-number">{completion}<small>%</small></div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{width: `${completion}%`}}/>
                  </div>
                  <div className="progress-caption">
                    <span>{completed} completed</span>
                    <span>{pending} pending</span>
                  </div>
                  <div className="progress-note">
                    <Target size={17}/>
                    <span>Small consistent steps create meaningful progress.</span>
                  </div>
                </section>
              </div>

              <div className="stat-grid study-overview-stats">
                <Stat icon={Timer} label="Total study time"
                  value={formatMinutes(totalStudyMinutes)} note="Recorded focus sessions" color="purple"/>
                <Stat icon={History} label="Focus sessions"
                  value={sessions.length} note="Completed sessions" color="blue"/>
              </div>

              <div className="bottom-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div><h2>My subjects</h2><p>Your learning areas</p></div>
                    <button className="text-btn"
                      onClick={() => setPage("My Subjects")}>
                      Manage <ChevronRight size={15}/>
                    </button>
                  </div>
                  {subjects.slice(0, 4).map(s => (
                    <div className="mini-subject" key={s.id}>
                      <span className="subject-dot" style={{background:s.color}}/>
                      <b>{s.name}</b>
                    </div>
                  ))}
                  {!subjects.length && <div className="empty">No subjects yet.</div>}
                </section>

                <section className="panel">
                  <div className="panel-heading">
                    <div><h2>Upcoming examinations</h2><p>Plan ahead</p></div>
                    <CalendarDays size={19}/>
                  </div>
                  {exams.slice(0, 3).map(e => (
                    <div className="exam-row" key={e.id}>
                      <div><b>{e.title}</b><small>{e.exam_date}</small></div>
                      <span>{e.exam_date}</span>
                    </div>
                  ))}
                  {!exams.length && <div className="empty">No examinations added.</div>}
                </section>
              </div>

              <section className="panel backup-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Your data & backups</h2>
                    <p>Your information stays in this browser unless you export it.</p>
                  </div>
                  <Download size={20}/>
                </div>
                <div className="backup-actions">
                  <button className="primary" onClick={exportBackup}>
                    <Download size={17}/> Export backup
                  </button>
                  <button className="secondary-btn" onClick={() => importRef.current?.click()}>
                    <Upload size={17}/> Import backup
                  </button>
                  <input ref={importRef} type="file"
                    accept=".json,application/json" hidden onChange={importBackup}/>
                </div>
              </section>
            </>}

            {page === "My Subjects" && (
              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Subject management</h2><p>Organise your academic subjects</p></div>
                  <BookMarked/>
                </div>
                <form className="inline-form" onSubmit={addSubject}>
                  <input value={subjectName}
                    onChange={e => setSubjectName(e.target.value)}
                    placeholder="Enter a subject name" required/>
                  <button className="primary"><Plus size={17}/> Add subject</button>
                </form>
                {subjectList()}
              </section>
            )}

            {(page === "Study Planner" || page === "Assignments") && (
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>{page === "Assignments" ? "Assignments & homework" : "Your study planner"}</h2>
                    <p>Create tasks and track your progress</p>
                  </div>
                  <CalendarDays/>
                </div>
                <form className="task-form" onSubmit={addTask}>
                  <input value={taskTitle}
                    onChange={e => setTaskTitle(e.target.value)}
                    placeholder="What do you need to study?" required/>
                  <select value={taskSubject}
                    onChange={e => setTaskSubject(e.target.value)}>
                    <option value="">Choose subject</option>
                    {subjects.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}
                  </select>
                  <input type="date" value={taskDate}
                    onChange={e => setTaskDate(e.target.value)}/>
                  <button className="primary"><Plus size={17}/> Add task</button>
                </form>
                {taskList()}
              </section>
            )}

            {page === "Examinations" && (
              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Examination tracker</h2><p>Keep track of your upcoming exams</p></div>
                  <GraduationCap/>
                </div>
                <form className="task-form" onSubmit={addExam}>
                  <input value={examTitle}
                    onChange={e => setExamTitle(e.target.value)}
                    placeholder="Examination name" required/>
                  <input type="date" value={examDate}
                    onChange={e => setExamDate(e.target.value)} required/>
                  <button className="primary"><Plus size={17}/> Add exam</button>
                </form>
                {exams.map(e => (
                  <div className="exam-row" key={e.id}>
                    <div><b>{e.title}</b><small>{e.exam_date}</small></div>
                    <span>{e.exam_date}</span>
                    <button className="icon-btn danger"
                      onClick={() => action(() => db.remove("exams", e.id))}>
                      <Trash2 size={16}/>
                    </button>
                  </div>
                ))}
                {!exams.length && <div className="empty">No exams added yet.</div>}
              </section>
            )}

            {page === "Syllabus Tracker" && (
              <section className="panel">
                <div className="panel-heading">
                  <div><h2>Syllabus management</h2><p>Track your chapter and topic completion</p></div>
                  <BookMarked/>
                </div>

                <form className="task-form" onSubmit={addTopic}>
                  <input value={topicTitle}
                    onChange={e => setTopicTitle(e.target.value)}
                    placeholder="Enter chapter or topic name" required/>
                  <select value={topicSubject}
                    onChange={e => setTopicSubject(e.target.value)} required>
                    <option value="">Choose subject</option>
                    {subjects.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}
                  </select>
                  <button className="primary"><Plus size={17}/> Add topic</button>
                </form>

                <div className="syllabus-summary">
                  <b>{topicCompleted} / {topics.length}</b>
                  <span>Topics completed Â· {topicPercent}%</span>
                  <div className="progress-track">
                    <div className="progress-fill" style={{width: `${topicPercent}%`}}/>
                  </div>
                </div>

                {subjects.map(s => {
                  const group = topics.filter(t => t.subject_id === s.id);
                  const done = group.filter(t => t.completed).length;

                  return (
                    <div className="syllabus-group" key={s.id}>
                      <div className="syllabus-heading">
                        <b>{s.name}</b>
                        <span>{done}/{group.length} completed</span>
                      </div>
                      {group.map(t => (
                        <div className="task-row" key={t.id}>
                          <button
                            className={"check " + (t.completed ? "checked" : "")}
                            onClick={() => toggleTopic(t)}>
                            {t.completed ? <Check size={15}/> : null}
                          </button>
                          <div className="task-info">
                            <div className={t.completed ? "task-title finished" : "task-title"}>
                              {t.title}
                            </div>
                          </div>
                          <button className="icon-btn danger"
                            onClick={() => action(() => db.remove("topics", t.id))}>
                            <Trash2 size={16}/>
                          </button>
                        </div>
                      ))}
                      {!group.length && <div className="empty">No topics added for this subject.</div>}
                    </div>
                  );
                })}

                {!subjects.length && <div className="empty">Add a subject before creating syllabus topics.</div>}
              </section>
            )}

            {page === "My Notes" && (
              <section className="panel">
                <div className="panel-heading">
                  <div><h2>My study notes</h2><p>Keep your learning material organised</p></div>
                  <BookOpen/>
                </div>

                <form className="notes-form" onSubmit={addNote}>
                  <input value={noteTitle}
                    onChange={e => setNoteTitle(e.target.value)}
                    placeholder="Note title" required/>
                  <select value={noteSubject}
                    onChange={e => setNoteSubject(e.target.value)}>
                    <option value="">General note</option>
                    {subjects.map(s => <option value={s.id} key={s.id}>{s.name}</option>)}
                  </select>
                  <textarea value={noteContent}
                    onChange={e => setNoteContent(e.target.value)}
                    placeholder="Write your notes here..." rows="6"/>
                  <button className="primary"><Plus size={17}/> Save note</button>
                </form>

                <div className="notes-grid">
                  {notes.map(n => (
                    <article className="note-card" key={n.id}>
                      <div className="note-card-top">
                        <BookMarked size={18}/>
                        <button className="icon-btn danger"
                          onClick={() => action(() => db.remove("notes", n.id))}>
                          <Trash2 size={16}/>
                        </button>
                      </div>
                      <h3>{n.title}</h3>
                      <small>{n.subject_name || "General note"}</small>
                      <p>{n.content || "No note content yet."}</p>
                    </article>
                  ))}
                </div>
                {!notes.length && <div className="empty">Your saved notes will appear here.</div>}
              </section>
            )}

            {page === "Focus Timer" && renderTimer()}
            {page === "Study History" && renderHistory()}
            {page === "Analytics" && renderAnalytics()}
            {page === "Calendar" && renderCalendar()}
          </>}

          <footer>
            StudyPilot <span>Â·</span> Your academic journey, one step at a time.
            <span> Â· </span> Your data stays on your device.
          </footer>
        </div>
      </main>
    </div>
  );
}

function Stat({ icon: Icon, label, value, note, color }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}><Icon size={20}/></div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}

export default App;



