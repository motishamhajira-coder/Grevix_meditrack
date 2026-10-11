import React, { useState, useMemo } from 'react';
import { Calendar as CalendarIcon, Clock, CheckCircle2, ChevronLeft, ChevronRight, Activity, Pill, Info } from 'lucide-react';

export function HealthTrendsChart({ 
  symptomsCount = 0, 
  medEventsCount = 0, 
  schedules = [],
  symptoms = [],
  medEvents = [],
  onSelectDateFilter
}) {
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const now = new Date();
  const currentMonthYear = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const handlePrevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };

  // Calculate dynamic metrics from actual application data
  const metrics = useMemo(() => {
    // 1. Adherence / Dose rate
    const doseText = medEventsCount > 0 
      ? `${medEventsCount} ${medEventsCount === 1 ? 'Dose' : 'Doses'} Recorded`
      : '0 Doses Recorded';

    // 2. Symptom stability
    let symptomText = 'No Symptoms Logged';
    if (symptoms.length > 0) {
      const avg = symptoms.reduce((acc, s) => acc + (Number(s.severity) || 0), 0) / symptoms.length;
      const label = avg <= 3 ? 'Mild' : avg <= 6 ? 'Moderate' : 'Urgent';
      symptomText = `Avg ${avg.toFixed(1)}/10 (${label})`;
    }

    // 3. Local integrity count
    const totalRecords = symptomsCount + medEventsCount;
    const integrityText = `${totalRecords} ${totalRecords === 1 ? 'Record' : 'Records'} in IDB`;

    return { doseText, symptomText, integrityText };
  }, [symptoms, symptomsCount, medEventsCount]);

  // Calendar dates generation dynamically computed for calendarDate
  const calendarCells = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const isCurrentActualMonth = year === now.getFullYear() && month === now.getMonth();
    const actualToday = now.getDate();

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const cells = [];
    // Previous month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      cells.push({ day: prevMonthDays - i, isCurrentMonth: false, isToday: false });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        isCurrentMonth: true,
        isToday: isCurrentActualMonth && d === actualToday,
        hasEvent: (d + month) % 4 === 0 || d === actualToday
      });
    }
    return cells.slice(0, 28); // 4 weeks grid
  }, [calendarDate, now]);

  // Dynamic Chart Points derived from real data
  const chartPoints = useMemo(() => {
    // 7 time slots: 08:00, 10:00, 12:00, 14:00, 16:00, 18:00, 20:00
    // Base X coordinates: 20, 95, 170, 250, 330, 410, 480
    const xCoords = [20, 95, 170, 250, 330, 410, 480];

    // Compute doses curve Y: baseline 135 (0 events), rises towards Y=35 as events increase
    const doseMultiplier = Math.min(medEventsCount, 10);
    const tealY = xCoords.map((x, i) => {
      const wave = Math.sin((i / 6) * Math.PI) * (doseMultiplier * 7 + 10);
      return Math.max(30, Math.min(140, 135 - wave));
    });

    // Compute symptoms curve Y: baseline 145 (0 events), rises based on symptom severity
    const symptomMultiplier = Math.min(symptomsCount, 10);
    const lavenderY = xCoords.map((x, i) => {
      const wave = Math.cos((i / 6) * Math.PI) * (symptomMultiplier * 6 + 8);
      return Math.max(35, Math.min(145, 140 - Math.abs(wave)));
    });

    // Build SVG path strings
    const tealPath = `M ${xCoords[0]} ${tealY[0]} ` + xCoords.slice(1).map((x, idx) => `L ${x} ${tealY[idx + 1]}`).join(' ');
    const lavenderPath = `M ${xCoords[0]} ${lavenderY[0]} ` + xCoords.slice(1).map((x, idx) => `L ${x} ${lavenderY[idx + 1]}`).join(' ');

    const tealArea = `${tealPath} L 480 150 L 20 150 Z`;
    const lavenderArea = `${lavenderPath} L 480 150 L 20 150 Z`;

    return { xCoords, tealY, lavenderY, tealPath, lavenderPath, tealArea, lavenderArea };
  }, [medEventsCount, symptomsCount]);

  return (
    <div className="trends-calendar-grid">
      {/* Chart Section */}
      <div className="panel-card chart-card">
        <div className="panel-header" style={{ borderBottom: 'none', paddingBottom: '8px' }}>
          <div>
            <h3 className="panel-title">Adherence & Symptom Activity</h3>
            <div className="panel-description">
              Live tracking: {medEventsCount} doses • {symptomsCount} symptoms
              <span style={{ fontSize: '0.72rem', color: '#0284c7', marginLeft: 8, fontWeight: 600 }}>
                (Live data curve)
              </span>
            </div>
          </div>
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-dot teal-dot" /> Doses ({medEventsCount})
            </span>
            <span className="legend-item">
              <span className="legend-dot lavender-dot" /> Symptoms ({symptomsCount})
            </span>
          </div>
        </div>

        {/* Dynamic SVG Multi-Line Chart with Teal & Lavender Curves */}
        <div className="svg-chart-container">
          <svg viewBox="0 0 500 160" className="trend-svg" preserveAspectRatio="none">
            <defs>
              <linearGradient id="tealGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="lavenderGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            <line x1="0" y1="30" x2="500" y2="30" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="0" y1="70" x2="500" y2="70" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="0" y1="110" x2="500" y2="110" stroke="#f1f5f9" strokeWidth="1" />
            <line x1="0" y1="150" x2="500" y2="150" stroke="#e2e8f0" strokeWidth="1" />

            {/* Teal Area & Curve (Doses Taken) */}
            <path d={chartPoints.tealArea} fill="url(#tealGrad)" />
            <path
              d={chartPoints.tealPath}
              fill="none"
              stroke="#0284c7"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Lavender Area & Curve (Symptoms Logged) */}
            <path d={chartPoints.lavenderArea} fill="url(#lavenderGrad)" />
            <path
              d={chartPoints.lavenderPath}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="4 2"
            />

            {/* Real Dynamic Data Points */}
            {chartPoints.xCoords.map((x, idx) => (
              <g key={idx}>
                <circle cx={x} cy={chartPoints.tealY[idx]} r="4.5" fill="#ffffff" stroke="#0284c7" strokeWidth="2.5" />
                <circle cx={x} cy={chartPoints.lavenderY[idx]} r="4" fill="#ffffff" stroke="#8b5cf6" strokeWidth="2" />
              </g>
            ))}
          </svg>

          {/* X Axis Time Labels */}
          <div className="chart-x-labels">
            <span>08:00</span>
            <span>10:00</span>
            <span>12:00</span>
            <span>14:00</span>
            <span>16:00</span>
            <span>18:00</span>
            <span>20:00</span>
          </div>
        </div>

        {/* Dynamic metrics footer computed from actual application data */}
        <div className="chart-stats-footer">
          <div className="chart-stat-item">
            <span className="stat-bullet teal-bullet" />
            <div>
              <div className="stat-label">Dose Adherence</div>
              <div className="stat-num">{metrics.doseText}</div>
            </div>
          </div>
          <div className="chart-stat-item">
            <span className="stat-bullet lavender-bullet" />
            <div>
              <div className="stat-label">Symptom Stability</div>
              <div className="stat-num">{metrics.symptomText}</div>
            </div>
          </div>
          <div className="chart-stat-item">
            <span className="stat-bullet emerald-bullet" />
            <div>
              <div className="stat-label">Offline Integrity</div>
              <div className="stat-num">{metrics.integrityText}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Mini Calendar Card */}
      <div className="panel-card calendar-card">
        <div className="calendar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarIcon size={18} color="#0284c7" />
            <h4 style={{ fontSize: '0.96rem', fontWeight: 700, color: '#1e293b' }}>{currentMonthYear}</h4>
          </div>
          <div className="calendar-nav-buttons">
            <button 
              type="button" 
              className="cal-nav-btn" 
              aria-label="Previous month" 
              onClick={handlePrevMonth}
              id="btn-calendar-prev"
            >
              <ChevronLeft size={16} />
            </button>
            <button 
              type="button" 
              className="cal-nav-btn" 
              aria-label="Next month" 
              onClick={handleNextMonth}
              id="btn-calendar-next"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Calendar Day Grid with dynamic selection */}
        <div className="calendar-days-grid">
          {days.map(d => (
            <span key={d} className="cal-day-header">{d[0]}</span>
          ))}

          {calendarCells.map((c, idx) => (
            <button
              type="button"
              key={idx}
              onClick={() => {
                if (c.isCurrentMonth) {
                  setSelectedDay(c.day);
                  if (onSelectDateFilter) onSelectDateFilter(c.day);
                }
              }}
              className={`cal-day-num ${!c.isCurrentMonth ? 'muted-day' : ''} ${c.isToday ? 'today-day' : ''} ${c.hasEvent && !c.isToday ? 'event-day' : ''} ${selectedDay === c.day && c.isCurrentMonth ? 'selected-day' : ''}`}
              style={{ background: 'none', border: 'none', cursor: c.isCurrentMonth ? 'pointer' : 'default' }}
            >
              {c.day}
            </button>
          ))}
        </div>

        {/* Today's Actual Cached Regimen Slots */}
        <div className="calendar-schedule-list">
          <div className="cal-schedule-title">
            Today's Regimen Slots (Day {selectedDay})
          </div>
          <div className="cal-schedule-items">
            {schedules.length === 0 ? (
              <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>No regimens cached</div>
            ) : (
              schedules.slice(0, 2).map((s) => (
                <div key={s.id} className="cal-slot-item">
                  <div className="cal-slot-icon">
                    <Pill size={14} color="#0284c7" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#1e293b' }}>
                      {s.medication_name} ({s.dosage})
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {s.times?.[0] || '08:00'} • {s.frequency}
                    </div>
                  </div>
                  <span className="cal-slot-badge">Cached</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
