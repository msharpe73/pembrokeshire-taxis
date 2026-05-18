const { useState, useEffect, useMemo, useRef, useCallback } = React;
const DAYS = [{
  js: 0,
  s: 'Su',
  f: 'Sun'
}, {
  js: 1,
  s: 'M',
  f: 'Mon'
}, {
  js: 2,
  s: 'T',
  f: 'Tue'
}, {
  js: 3,
  s: 'W',
  f: 'Wed'
}, {
  js: 4,
  s: 'T',
  f: 'Thu'
}, {
  js: 5,
  s: 'F',
  f: 'Fri'
}, {
  js: 6,
  s: 'Sa',
  f: 'Sat'
}];
const genId = () => Math.random().toString(36).substr(2, 9);
const today = () => new Date().toISOString().split('T')[0];
const getDOW = d => new Date(d + 'T12:00:00').getDay();
const fmt = t => {
  if (!t) return '';
  const [h, m] = t.split(':');
  const hr = parseInt(h);
  return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
};
const prettyDate = d => {
  const dt = new Date(d + 'T12:00:00');
  return `${'Sun Mon Tue Wed Thu Fri Sat'.split(' ')[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
};
const addDays = (d, n) => {
  const dt = new Date(d + 'T12:00:00');
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split('T')[0];
};
const mapsUrl = (f, t) => `https://www.google.com/maps/dir/${encodeURIComponent(f)}/${encodeURIComponent(t)}`;
const MANAGER_PIN = '000000';

// ── CLASH DETECTION ───────────────────────────────────────────────────────────
function timeToMins(t) {
  if (!t) return -1;
  const [h, m] = t.split(':');
  return parseInt(h) * 60 + parseInt(m);
}
function checkClash(driverId, newTime, excludeRunId, allRuns, windowMins = 30) {
  if (!driverId || !newTime) return null;
  const newMins = timeToMins(newTime);
  const clashes = allRuns.filter(r => {
    if (r.id === excludeRunId) return false;
    if (r.driverId !== driverId) return false;
    if (r.status === 'cancelled' || r.status === 'holiday') return false;
    const diff = Math.abs(timeToMins(r.time) - newMins);
    return diff < windowMins;
  });
  return clashes.length ? clashes[0] : null;
}

// ── HOLIDAY CHECK ─────────────────────────────────────────────────────────────
function isHoliday(date, holidays, schoolId) {
  return holidays.some(h => {
    if (h.date !== date) return false;
    if (h.scope === 'all') return true;
    if (h.scope === 'school' && h.schoolId === schoolId) return true;
    return false;
  });
}

// ── COMPUTE RUNS ──────────────────────────────────────────────────────────────
function computeRuns(schedules, oneoffs, jobs, date, holidays) {
  const dow = getDOW(date),
    out = [];
  for (const s of schedules) {
    if (!s.active || s.archived || s.startDate > date) continue;
    if (s.endDate && s.endDate < date) continue;
    if (!s.days.includes(dow)) continue;
    const ov = s.overrides?.[date] || {};
    const schoolId = s.schoolId || '';
    const hol = isHoliday(date, holidays, schoolId);
    if (hol) {
      out.push({
        id: `${s.id}_${date}_p`,
        scheduleId: s.id,
        passengerId: s.passengerId,
        passengerName: s.passengerName,
        scheduleLabel: s.label || '',
        date,
        type: 'pickup',
        time: s.pickup.time,
        pickup: s.pickup.pickup,
        dropoff: s.pickup.dropoff,
        wheelchair: s.wheelchair,
        driverId: s.pickup.driverId,
        driverName: s.pickup.driverName,
        assistantId: s.pickup.assistantId,
        assistantName: s.pickup.assistantName,
        status: 'holiday',
        holidayName: holidays.find(h => h.date === date && (h.scope === 'all' || h.schoolId === schoolId))?.name || 'School Holiday',
        isRecurring: true,
        cancelNote: '',
        chargeStatus: '',
        kind: 'school'
      });
      continue;
    }
    if (!ov.pickupCancelled) {
      const dId = ov.pickupDriver?.id ?? s.pickup.driverId,
        dNm = ov.pickupDriver?.name ?? s.pickup.driverName;
      const aId = ov.pickupAsst?.id ?? s.pickup.assistantId,
        aNm = ov.pickupAsst?.name ?? s.pickup.assistantName;
      out.push({
        id: `${s.id}_${date}_p`,
        scheduleId: s.id,
        passengerId: s.passengerId,
        passengerName: s.passengerName,
        scheduleLabel: s.label || '',
        date,
        type: 'pickup',
        time: ov.pickupTime || s.pickup.time,
        pickup: ov.pickupAddress || s.pickup.pickup,
        dropoff: ov.pickupDropoff || s.pickup.dropoff,
        wheelchair: s.wheelchair,
        driverId: dId,
        driverName: dNm,
        assistantId: aId,
        assistantName: aNm,
        status: dId ? 'scheduled' : 'unassigned',
        isRecurring: true,
        notes: s.notes || '',
        cancelNote: '',
        chargeStatus: '',
        cancelledAt: null,
        kind: 'school'
      });
    } else {
      out.push({
        id: `${s.id}_${date}_p`,
        scheduleId: s.id,
        passengerId: s.passengerId,
        passengerName: s.passengerName,
        scheduleLabel: s.label || '',
        date,
        type: 'pickup',
        time: s.pickup.time,
        pickup: s.pickup.pickup,
        dropoff: s.pickup.dropoff,
        wheelchair: s.wheelchair,
        driverId: s.pickup.driverId,
        driverName: s.pickup.driverName,
        assistantId: s.pickup.assistantId,
        assistantName: s.pickup.assistantName,
        status: 'cancelled',
        isRecurring: true,
        notes: s.notes || '',
        cancelNote: ov.cancelNote || '',
        chargeStatus: ov.chargeStatus || '',
        cancelledAt: ov.cancelledAt || null,
        kind: 'school'
      });
    }
    if (s.hasReturn && !hol) {
      if (!ov.returnCancelled) {
        const dId = ov.returnDriver?.id ?? s.return.driverId,
          dNm = ov.returnDriver?.name ?? s.return.driverName;
        const aId = ov.returnAsst?.id ?? s.return.assistantId,
          aNm = ov.returnAsst?.name ?? s.return.assistantName;
        out.push({
          id: `${s.id}_${date}_r`,
          scheduleId: s.id,
          passengerId: s.passengerId,
          passengerName: s.passengerName,
          scheduleLabel: s.label || '',
          date,
          type: 'return',
          time: ov.returnTime || s.return.time,
          pickup: ov.returnAddress || s.return.pickup,
          dropoff: ov.returnDropoff || s.return.dropoff,
          wheelchair: s.wheelchair,
          driverId: dId,
          driverName: dNm,
          assistantId: aId,
          assistantName: aNm,
          status: dId ? 'scheduled' : 'unassigned',
          isRecurring: true,
          notes: s.notes || '',
          cancelNote: '',
          chargeStatus: '',
          cancelledAt: null,
          kind: 'school'
        });
      } else {
        out.push({
          id: `${s.id}_${date}_r`,
          scheduleId: s.id,
          passengerId: s.passengerId,
          passengerName: s.passengerName,
          scheduleLabel: s.label || '',
          date,
          type: 'return',
          time: s.return.time,
          pickup: s.return.pickup,
          dropoff: s.return.dropoff,
          wheelchair: s.wheelchair,
          driverId: s.return.driverId,
          driverName: s.return.driverName,
          assistantId: s.return.assistantId,
          assistantName: s.return.assistantName,
          status: 'cancelled',
          isRecurring: true,
          notes: s.notes || '',
          cancelNote: ov.returnCancelNote || '',
          chargeStatus: ov.returnChargeStatus || '',
          cancelledAt: ov.returnCancelledAt || null,
          kind: 'school'
        });
      }
    }
  }
  out.push(...oneoffs.filter(r => r.date === date));
  // Jobs
  out.push(...jobs.filter(j => j.date === date).map(j => ({
    ...j,
    kind: 'job'
  })));
  return out;
}
const blankJourney = () => ({
  time: '',
  pickup: '',
  dropoff: '',
  driverId: '',
  driverName: '',
  assistantId: '',
  assistantName: ''
});
const blankSchedule = (passengerId, passengerName, wheelchair) => ({
  id: genId(),
  passengerId,
  passengerName,
  wheelchair,
  label: 'Schedule 1',
  days: [1, 2, 3, 4, 5],
  pickup: {
    time: '08:30',
    pickup: '',
    dropoff: '',
    driverId: '',
    driverName: '',
    assistantId: '',
    assistantName: ''
  },
  hasReturn: false,
  return: blankJourney(),
  startDate: today(),
  active: true,
  overrides: {},
  notes: ''
});

// ── SAMPLE DATA ───────────────────────────────────────────────────────────────
const D0 = [{
  id: 'dr1',
  name: 'John Smith',
  address: '14 Oak Street',
  town: 'Didsbury',
  postcode: 'M20 1AA',
  phone: '07700 900001',
  avail: true,
  pin: '123456'
}, {
  id: 'dr2',
  name: 'Sarah Jones',
  address: '8 Regent Road',
  town: 'Salford',
  postcode: 'M5 4QR',
  phone: '07700 900002',
  avail: true,
  pin: '234567'
}, {
  id: 'dr3',
  name: 'Mike Brown',
  address: '32 Chapel Lane',
  town: 'Stockport',
  postcode: 'SK1 3BT',
  phone: '07700 900003',
  avail: true,
  pin: '345678'
}, {
  id: 'dr4',
  name: 'Lisa Green',
  address: '5 Victoria Road',
  town: 'Stretford',
  postcode: 'M32 0AB',
  phone: '07700 900004',
  avail: true,
  pin: '456789'
}];
const A0 = [{
  id: 'as1',
  name: 'Tom Harris',
  address: '22 Elm Close',
  town: 'Didsbury',
  postcode: 'M20 6TY',
  phone: '07700 800001',
  avail: true
}, {
  id: 'as2',
  name: 'Priya Patel',
  address: '67 Brook Street',
  town: 'Salford',
  postcode: 'M6 5NP',
  phone: '07700 800002',
  avail: true
}];
const P0 = [{
  id: 'p1',
  name: 'Emma',
  address: '23 Rose Street',
  town: 'Didsbury',
  postcode: 'M20 2LN',
  wheelchair: false,
  notes: 'Alt Fri pickup: 15 Cedar Close, Bolton',
  archived: false
}, {
  id: 'p2',
  name: 'James',
  address: '67 Pine Road',
  town: 'Salford',
  postcode: 'M6 7PQ',
  wheelchair: false,
  notes: '',
  archived: false
}, {
  id: 'p3',
  name: 'Sophie',
  address: '4 Elm Avenue',
  town: 'Stockport',
  postcode: 'SK2 6DF',
  wheelchair: true,
  notes: '',
  archived: false
}, {
  id: 'p4',
  name: 'Liam',
  address: '12 Birch Close',
  town: 'Salford',
  postcode: 'M6 8RT',
  wheelchair: false,
  notes: '',
  archived: false
}, {
  id: 'p5',
  name: 'Aisha',
  address: '89 Cedar Way',
  town: 'Salford',
  postcode: 'M7 3KL',
  wheelchair: false,
  notes: '',
  archived: false
}];
const SC0 = [{
  id: 'sc1',
  passengerId: 'p1',
  passengerName: 'Emma',
  wheelchair: false,
  label: 'Mon–Fri',
  days: [1, 2, 3, 4, 5],
  pickup: {
    time: '08:30',
    pickup: '23 Rose Street, Didsbury, M20 2LN',
    dropoff: "St Mary's Primary School, Didsbury",
    driverId: 'dr1',
    driverName: 'John Smith',
    assistantId: '',
    assistantName: ''
  },
  hasReturn: true,
  return: {
    time: '15:30',
    pickup: "St Mary's Primary School, Didsbury",
    dropoff: '23 Rose Street, Didsbury, M20 2LN',
    driverId: 'dr4',
    driverName: 'Lisa Green',
    assistantId: '',
    assistantName: ''
  },
  startDate: today(),
  active: true,
  archived: false,
  overrides: {},
  notes: ''
}, {
  id: 'sc2',
  passengerId: 'p2',
  passengerName: 'James',
  wheelchair: false,
  label: 'Mon–Fri',
  days: [1, 2, 3, 4, 5],
  pickup: {
    time: '08:15',
    pickup: '67 Pine Road, Salford, M6 7PQ',
    dropoff: 'Brookfield Academy, Stretford',
    driverId: 'dr3',
    driverName: 'Mike Brown',
    assistantId: 'as2',
    assistantName: 'Priya Patel'
  },
  hasReturn: true,
  return: {
    time: '15:20',
    pickup: 'Brookfield Academy, Stretford',
    dropoff: '67 Pine Road, Salford, M6 7PQ',
    driverId: 'dr3',
    driverName: 'Mike Brown',
    assistantId: 'as2',
    assistantName: 'Priya Patel'
  },
  startDate: today(),
  active: true,
  archived: false,
  overrides: {},
  notes: ''
}, {
  id: 'sc3',
  passengerId: 'p3',
  passengerName: 'Sophie',
  wheelchair: true,
  label: 'Mon–Fri',
  days: [1, 2, 3, 4, 5],
  pickup: {
    time: '08:45',
    pickup: '4 Elm Avenue, Stockport, SK2 6DF',
    dropoff: 'Highfield Special School, Stockport',
    driverId: 'dr2',
    driverName: 'Sarah Jones',
    assistantId: 'as1',
    assistantName: 'Tom Harris'
  },
  hasReturn: true,
  return: {
    time: '15:15',
    pickup: 'Highfield Special School, Stockport',
    dropoff: '4 Elm Avenue, Stockport, SK2 6DF',
    driverId: 'dr2',
    driverName: 'Sarah Jones',
    assistantId: 'as1',
    assistantName: 'Tom Harris'
  },
  startDate: today(),
  active: true,
  archived: false,
  overrides: {},
  notes: ''
}, {
  id: 'sc4a',
  passengerId: 'p4',
  passengerName: 'Liam',
  wheelchair: false,
  label: 'Mon/Wed/Fri',
  days: [1, 3, 5],
  pickup: {
    time: '08:10',
    pickup: '12 Birch Close, Salford, M6 8RT',
    dropoff: 'Brookfield Academy, Stretford',
    driverId: 'dr1',
    driverName: 'John Smith',
    assistantId: '',
    assistantName: ''
  },
  hasReturn: false,
  return: blankJourney(),
  startDate: today(),
  active: true,
  archived: false,
  overrides: {},
  notes: ''
}, {
  id: 'sc4b',
  passengerId: 'p4',
  passengerName: 'Liam',
  wheelchair: false,
  label: 'Tue/Thu',
  days: [2, 4],
  pickup: {
    time: '09:00',
    pickup: '12 Birch Close, Salford, M6 8RT',
    dropoff: 'Oak Hill School, Salford',
    driverId: 'dr3',
    driverName: 'Mike Brown',
    assistantId: '',
    assistantName: ''
  },
  hasReturn: true,
  return: {
    time: '15:45',
    pickup: 'Oak Hill School, Salford',
    dropoff: '12 Birch Close, Salford, M6 8RT',
    driverId: 'dr3',
    driverName: 'Mike Brown',
    assistantId: '',
    assistantName: ''
  },
  startDate: today(),
  active: true,
  archived: false,
  overrides: {},
  notes: ''
}, {
  id: 'sc5',
  passengerId: 'p5',
  passengerName: 'Aisha',
  wheelchair: false,
  label: 'Mon–Fri',
  days: [1, 2, 3, 4, 5],
  pickup: {
    time: '08:20',
    pickup: '89 Cedar Way, Salford, M7 3KL',
    dropoff: 'Oak Hill School, Salford',
    driverId: 'dr4',
    driverName: 'Lisa Green',
    assistantId: '',
    assistantName: ''
  },
  hasReturn: true,
  return: {
    time: '15:00',
    pickup: 'Oak Hill School, Salford',
    dropoff: '89 Cedar Way, Salford, M7 3KL',
    driverId: 'dr3',
    driverName: 'Mike Brown',
    assistantId: '',
    assistantName: ''
  },
  startDate: today(),
  active: true,
  archived: false,
  overrides: {},
  notes: ''
}];
const ld = async (k, fb) => {
  try {
    const r = await window.storage.get(k);
    return r ? JSON.parse(r.value) : fb;
  } catch {
    return fb;
  }
};
const sv = async (k, v) => {
  try {
    await window.storage.set(k, JSON.stringify(v));
  } catch {}
};

// ── UI ATOMS ──────────────────────────────────────────────────────────────────
const BDGE = {
  unassigned: 'bg-amber-100 text-amber-700 border border-amber-200',
  scheduled: 'bg-sky-100 text-sky-700 border border-sky-200',
  cancelled: 'bg-red-100 text-red-600 border border-red-200',
  holiday: 'bg-purple-100 text-purple-700 border border-purple-200',
  job: 'bg-orange-100 text-orange-700 border border-orange-200'
};
const Badge = ({
  s,
  chargeStatus,
  label
}) => /*#__PURE__*/React.createElement("div", {
  className: "flex flex-col items-end gap-1"
}, /*#__PURE__*/React.createElement("span", {
  className: `text-xs px-2 py-0.5 rounded-full font-semibold ${BDGE[s] || BDGE.unassigned}`
}, label || s), s === 'cancelled' && chargeStatus && /*#__PURE__*/React.createElement("span", {
  className: `text-xs px-2 py-0.5 rounded-full font-semibold ${chargeStatus === 'charged' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`
}, chargeStatus === 'charged' ? '💰 Charged' : '✓ No charge'));
function Modal({
  title,
  onClose,
  children,
  size = 'md'
}) {
  const w = size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg';
  return /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center",
    style: {
      background: 'rgba(10,10,20,0.7)',
      backdropFilter: 'blur(6px)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: `bg-white w-full ${w} rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col`,
    style: {
      maxHeight: '92vh'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100 shrink-0"
  }, /*#__PURE__*/React.createElement("h2", {
    className: "font-bold text-gray-800"
  }, title), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 text-lg"
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    className: "px-5 py-4 overflow-y-auto"
  }, children)));
}
const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-400 bg-gray-50';
function Field({
  label,
  hint,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/React.createElement("label", {
    className: "block text-xs font-semibold text-gray-500 uppercase tracking-wide"
  }, label), children, hint && /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-gray-400"
  }, hint));
}
function DayPicker({
  value,
  onChange
}) {
  const toggle = d => onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d].sort((a, b) => a - b));
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-1.5 flex-wrap"
  }, DAYS.map(({
    js,
    s,
    f
  }) => /*#__PURE__*/React.createElement("button", {
    key: js,
    type: "button",
    title: f,
    onClick: () => toggle(js),
    className: `w-9 h-9 rounded-full text-xs font-bold transition-all ${value.includes(js) ? 'bg-sky-600 text-white' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`
  }, s))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-gray-400"
  }, "Tap the days this schedule runs. Select multiple days if the same schedule repeats."));
}

// ── DATE NAV ──────────────────────────────────────────────────────────────────
function DateNav({
  date,
  onChange,
  limitToTomorrow = false
}) {
  const tomorrow = addDays(today(), 1);
  return /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 bg-white/10 rounded-2xl px-3 py-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(addDays(date, -1)),
    className: "text-white/80 hover:text-white text-2xl font-bold w-8 text-center"
  }, "\u2039"), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 flex items-center justify-center gap-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-bold text-sm"
  }, prettyDate(date)), date === today() && /*#__PURE__*/React.createElement("div", {
    className: "text-xs opacity-70"
  }, "Today"), date === tomorrow && /*#__PURE__*/React.createElement("div", {
    className: "text-xs opacity-70"
  }, "Tomorrow")), !limitToTomorrow && /*#__PURE__*/React.createElement("input", {
    type: "date",
    value: date,
    onChange: e => onChange(e.target.value),
    className: "text-xs bg-white/20 border border-white/30 text-white rounded-lg px-2 py-1 focus:outline-none w-8 opacity-60 hover:opacity-100 cursor-pointer",
    style: {
      colorScheme: 'dark'
    },
    title: "Jump to date"
  })), /*#__PURE__*/React.createElement("button", {
    onClick: () => onChange(addDays(date, 1)),
    disabled: limitToTomorrow && date >= tomorrow,
    className: "text-white/80 hover:text-white text-2xl font-bold w-8 text-center disabled:opacity-30"
  }, "\u203A"));
}

// ── PIN LOGIN ─────────────────────────────────────────────────────────────────
function PinLogin({
  drivers,
  onStaffLogin,
  onManagerLogin
}) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('choice');
  const [manPin, setManPin] = useState('');
  const handleStaffPin = () => {
    if (pin.length !== 6) {
      setErr('Please enter all 6 digits.');
      return;
    }
    if (pin === MANAGER_PIN) {
      setErr('Incorrect PIN.');
      return;
    }
    const driver = drivers.find(d => d.pin === pin);
    if (!driver) {
      setErr('PIN not recognised. Please check with your manager.');
      return;
    }
    onStaffLogin(driver);
  };
  const handleManagerPin = () => {
    if (manPin === MANAGER_PIN) onManagerLogin();else setErr('Incorrect manager PIN.');
  };
  const PinPad = ({
    value,
    onChange,
    onSubmit,
    label,
    dark = false
  }) => {
    const press = d => {
      if (value.length < 6) onChange(value + d);
    };
    const del = () => onChange(value.slice(0, -1));
    return /*#__PURE__*/React.createElement("div", {
      className: "space-y-6"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-center gap-3"
    }, Array(6).fill(0).map((_, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: `w-4 h-4 rounded-full border-2 transition-all ${i < value.length ? dark ? 'bg-gray-800 border-gray-800' : 'bg-sky-600 border-sky-600' : 'border-gray-300'}`
    }))), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-3 gap-3"
    }, [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k, i) => /*#__PURE__*/React.createElement("button", {
      key: i,
      onClick: () => k === '' ? null : k === '⌫' ? del() : press(String(k)),
      className: `h-14 rounded-2xl text-xl font-bold transition-all ${k === '' ? 'invisible' : k === '⌫' ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-white border border-gray-200 text-gray-800 hover:bg-sky-50 hover:border-sky-300 shadow-sm'}`
    }, k))), err && /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-red-500 text-center font-medium"
    }, err), /*#__PURE__*/React.createElement("button", {
      onClick: onSubmit,
      disabled: value.length !== 6,
      className: `w-full py-3.5 rounded-2xl font-bold text-sm disabled:opacity-40 text-white ${dark ? 'bg-gray-800 hover:bg-gray-900' : 'bg-sky-600 hover:bg-sky-700'}`
    }, label));
  };
  if (mode === 'choice') return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gradient-to-br from-sky-700 to-indigo-800 flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-5xl"
  }, "\uD83D\uDE90"), /*#__PURE__*/React.createElement("h1", {
    className: "text-2xl font-black text-gray-800"
  }, "Pembrokeshire Taxis"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-500 font-semibold"
  }, "School Transport Manager"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-gray-400"
  }, "Who is logging in?")), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setMode('staff');
      setErr('');
      setPin('');
    },
    className: "w-full py-4 bg-sky-600 text-white rounded-2xl font-bold text-lg hover:bg-sky-700"
  }, "\uD83D\uDC64 Staff Login"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      setMode('manager');
      setErr('');
      setManPin('');
    },
    className: "w-full py-4 bg-gray-800 text-white rounded-2xl font-bold text-lg hover:bg-gray-900"
  }, "\uD83D\uDDC2 Manager Login"))));
  if (mode === 'staff') return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gradient-to-br from-sky-700 to-indigo-800 flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setMode('choice'),
    className: "text-xs text-gray-400 hover:text-gray-600"
  }, "\u2190 Back"), /*#__PURE__*/React.createElement("div", {
    className: "text-4xl"
  }, "\uD83D\uDC64"), /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-black text-gray-800"
  }, "Staff Login"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-500"
  }, "Enter your 6-digit PIN")), /*#__PURE__*/React.createElement(PinPad, {
    value: pin,
    onChange: v => {
      setPin(v);
      setErr('');
    },
    onSubmit: handleStaffPin,
    label: "Log In"
  })));
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-3xl shadow-2xl p-8 w-full max-w-sm space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center space-y-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setMode('choice'),
    className: "text-xs text-gray-400 hover:text-gray-600"
  }, "\u2190 Back"), /*#__PURE__*/React.createElement("div", {
    className: "text-4xl"
  }, "\uD83D\uDDC2"), /*#__PURE__*/React.createElement("h1", {
    className: "text-xl font-black text-gray-800"
  }, "Manager Login"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-500"
  }, "Enter manager PIN")), /*#__PURE__*/React.createElement(PinPad, {
    value: manPin,
    onChange: v => {
      setManPin(v);
      setErr('');
    },
    onSubmit: handleManagerPin,
    label: "Log In as Manager",
    dark: true
  })));
}

// ── EDIT CHOICE MODAL ─────────────────────────────────────────────────────────
function EditChoiceModal({
  run,
  onEditToday,
  onEditSchedule,
  onClose
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    title: `${run.passengerName} — ${run.type === 'return' ? 'Return' : 'Pickup'}`,
    onClose: onClose,
    size: "sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-600"
  }, "What would you like to change?"), /*#__PURE__*/React.createElement("button", {
    onClick: onEditToday,
    className: "w-full py-4 bg-sky-50 border-2 border-sky-200 text-sky-700 rounded-2xl font-bold text-sm hover:bg-sky-100 text-left px-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-bold"
  }, "\uD83D\uDCC5 Edit Today Only"), /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-normal mt-0.5 text-sky-600"
  }, "Change time, driver, assistant or address for ", prettyDate(run.date), " only.")), /*#__PURE__*/React.createElement("button", {
    onClick: onEditSchedule,
    className: "w-full py-4 bg-indigo-50 border-2 border-indigo-200 text-indigo-700 rounded-2xl font-bold text-sm hover:bg-indigo-100 text-left px-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-bold"
  }, "\uD83D\uDCCB Edit Passenger Schedule"), /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-normal mt-0.5 text-indigo-600"
  }, "Change the recurring schedule, add a return journey, change regular driver etc."))));
}

// ── EDIT TODAY MODAL ──────────────────────────────────────────────────────────
function EditTodayModal({
  run,
  drivers,
  allStaff,
  allRuns,
  onSave,
  onCancel,
  onClose
}) {
  const [time, setTime] = useState(run.time || '');
  const [pickup, setPickup] = useState(run.pickup || '');
  const [dropoff, setDropoff] = useState(run.dropoff || '');
  const [dId, setDId] = useState(run.driverId || '');
  const [aId, setAId] = useState(run.assistantId || '');
  const [clashWarning, setClashWarning] = useState(null);
  const availD = drivers.filter(d => d.avail && (run.wheelchair ? d.vehicle === 'wheelchair' : true));
  const doSave = () => {
    const dr = drivers.find(d => d.id === dId);
    const as = allStaff.find(a => a.id === aId);
    onSave(run, {
      time,
      pickup,
      dropoff,
      driverId: dId,
      driverName: dr?.name || '',
      assistantId: aId,
      assistantName: as?.name || ''
    });
    onClose();
  };
  const submit = () => {
    if (dId && time) {
      const clash = checkClash(dId, time, run.id, allRuns);
      if (clash) {
        setClashWarning({
          ...clash,
          newTime: time
        });
        return;
      }
    }
    doSave();
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, clashWarning && /*#__PURE__*/React.createElement(ClashWarningModal, {
    driverName: drivers.find(d => d.id === dId)?.name || '',
    existingRun: clashWarning,
    onProceed: () => {
      setClashWarning(null);
      doSave();
    },
    onBack: () => setClashWarning(null)
  }), /*#__PURE__*/React.createElement(Modal, {
    title: `Edit Today — ${run.passengerName}`,
    onClose: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 flex-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: `text-xs px-3 py-1 rounded-full font-bold ${run.type === 'return' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`
  }, run.type === 'return' ? '↩ Return' : '🏠 Pickup'), /*#__PURE__*/React.createElement("span", {
    className: "text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold"
  }, "\uD83D\uDCC5 ", prettyDate(run.date), " only")), /*#__PURE__*/React.createElement(Field, {
    label: "Time"
  }, /*#__PURE__*/React.createElement("input", {
    type: "time",
    className: inp,
    value: time,
    onChange: e => setTime(e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Pickup Address"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: pickup,
    onChange: e => setPickup(e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Drop-off Address"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: dropoff,
    onChange: e => setDropoff(e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Driver"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: dId,
    onChange: e => setDId(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Unassigned"), availD.map(d => /*#__PURE__*/React.createElement("option", {
    key: d.id,
    value: d.id
  }, d.name)))), /*#__PURE__*/React.createElement(Field, {
    label: "Passenger Assistant"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: aId,
    onChange: e => setAId(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "None"), allStaff.filter(a => a.avail).map(a => /*#__PURE__*/React.createElement("option", {
    key: a.id,
    value: a.id
  }, a.name)))), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-center text-gray-400 bg-gray-50 rounded-xl py-2"
  }, "Changes apply to ", prettyDate(run.date), " only."), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      onCancel(run);
      onClose();
    },
    className: "flex-1 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold border border-red-100"
  }, "\u2715 Cancel Run"), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    className: "flex-1 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold"
  }, "Save")))));
}

// ── REINSTATE MODAL (manager) ─────────────────────────────────────────────────
function ReinstateModal({
  run,
  drivers,
  allStaff,
  onSave,
  onClose
}) {
  const [dId, setDId] = useState(run.driverId || '');
  const [aId, setAId] = useState(run.assistantId || '');
  const availD = drivers.filter(d => d.avail && (run.wheelchair ? d.vehicle === 'wheelchair' : true));
  const submit = () => {
    const dr = drivers.find(d => d.id === dId);
    const as = allStaff.find(a => a.id === aId);
    onSave(run, {
      driverId: dId,
      driverName: dr?.name || '',
      assistantId: aId,
      assistantName: as?.name || ''
    });
    onClose();
  };
  return /*#__PURE__*/React.createElement(Modal, {
    title: `Reinstate Run — ${run.passengerName}`,
    onClose: onClose,
    size: "sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800"
  }, "This will reinstate the cancelled run for ", prettyDate(run.date), "."), /*#__PURE__*/React.createElement(Field, {
    label: "Driver"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: dId,
    onChange: e => setDId(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Unassigned"), availD.map(d => /*#__PURE__*/React.createElement("option", {
    key: d.id,
    value: d.id
  }, d.name)))), /*#__PURE__*/React.createElement(Field, {
    label: "Passenger Assistant"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: aId,
    onChange: e => setAId(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "None"), allStaff.filter(a => a.avail).map(a => /*#__PURE__*/React.createElement("option", {
    key: a.id,
    value: a.id
  }, a.name)))), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    className: "flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold"
  }, "\u2713 Reinstate Run"))));
}

// ── CHARGE MODAL ──────────────────────────────────────────────────────────────
// ── CLASH WARNING MODAL ───────────────────────────────────────────────────────
function ClashWarningModal({
  driverName,
  existingRun,
  onProceed,
  onBack
}) {
  const diff = Math.abs(timeToMins(existingRun.time) - timeToMins(existingRun.newTime));
  return /*#__PURE__*/React.createElement(Modal, {
    title: "\u26A0\uFE0F Schedule Clash",
    onClose: onBack,
    size: "sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-bold text-amber-800"
  }, driverName, " already has a run nearby:"), /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-amber-700"
  }, /*#__PURE__*/React.createElement("div", null, "\uD83D\uDD50 ", fmt(existingRun.time), " \u2014 ", existingRun.passengerName || existingRun.customerName), /*#__PURE__*/React.createElement("div", {
    className: "text-xs mt-1 text-amber-600"
  }, "Only ", /*#__PURE__*/React.createElement("strong", null, diff, " minute", diff !== 1 ? 's' : ''), " between these runs"))), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-600"
  }, "This driver may not have enough time between jobs. What would you like to do?"), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onBack,
    className: "flex-1 py-3 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:border-gray-300"
  }, "\u2190 Go Back to Edit"), /*#__PURE__*/React.createElement("button", {
    onClick: onProceed,
    className: "flex-1 py-3 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600"
  }, "Proceed Anyway"))));
}
function ChargeModal({
  run,
  onSave,
  onClose
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    title: "Set Charge Status",
    onClose: onClose,
    size: "sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-gray-50 rounded-xl p-3 space-y-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-semibold text-gray-800"
  }, run.passengerName, " \u2014 ", run.type === 'return' ? 'Return' : 'Pickup'), run.cancelNote && /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-gray-600 italic"
  }, "\"", run.cancelNote, "\"")), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-600"
  }, "Was this cancellation chargeable?"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => onSave('charged'),
    className: "w-full py-3.5 bg-orange-500 text-white rounded-xl font-bold text-sm hover:bg-orange-600"
  }, "\uD83D\uDCB0 Charged \u2014 driver attended, passenger didn't travel"), /*#__PURE__*/React.createElement("button", {
    onClick: () => onSave('no-charge'),
    className: "w-full py-3.5 bg-gray-200 text-gray-700 rounded-xl font-bold text-sm hover:bg-gray-300"
  }, "\u2713 No Charge \u2014 sufficient notice given"))));
}

// ── DRIVER CANCEL MODAL ───────────────────────────────────────────────────────
function DriverCancelModal({
  run,
  hasReturn,
  onConfirm,
  onClose
}) {
  const [note, setNote] = useState('');
  const [cancelReturn, setCancelReturn] = useState(null);
  const [step, setStep] = useState('note');
  const next = () => {
    if (!note.trim()) return;
    hasReturn && run.type === 'pickup' ? setStep('return') : onConfirm(note, false);
  };
  if (step === 'note') return /*#__PURE__*/React.createElement(Modal, {
    title: "Cancel Run",
    onClose: onClose,
    size: "sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800"
  }, /*#__PURE__*/React.createElement("strong", null, run.passengerName), " \u2014 ", fmt(run.time), " ", run.type === 'return' ? 'Return' : 'Pickup'), /*#__PURE__*/React.createElement(Field, {
    label: "Reason",
    hint: "e.g. No answer at door, Parent said child unwell"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 3,
    value: note,
    onChange: e => setNote(e.target.value),
    placeholder: "Type what happened\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
  }, "Back"), /*#__PURE__*/React.createElement("button", {
    onClick: next,
    disabled: !note.trim(),
    className: "flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-40"
  }, "Continue"))));
  return /*#__PURE__*/React.createElement(Modal, {
    title: "Cancel Return Journey?",
    onClose: onClose,
    size: "sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-gray-700"
  }, "This passenger has a return journey. Should it also be cancelled?"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setCancelReturn(true),
    className: `w-full py-3 rounded-xl text-sm font-bold border-2 transition-all ${cancelReturn === true ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-red-300'}`
  }, "\u2715 Yes \u2014 cancel the return too"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setCancelReturn(false),
    className: `w-full py-3 rounded-xl text-sm font-bold border-2 transition-all ${cancelReturn === false ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-gray-200 text-gray-600 hover:border-sky-300'}`
  }, "\u2713 No \u2014 return still going ahead")), cancelReturn !== null && /*#__PURE__*/React.createElement("button", {
    onClick: () => onConfirm(note, cancelReturn),
    className: "w-full py-3 bg-red-500 text-white rounded-xl text-sm font-bold"
  }, "Confirm Cancellation")));
}

// ── JOB FORM ──────────────────────────────────────────────────────────────────
function JobForm({
  existing,
  drivers,
  allStaff,
  onSave,
  onClose
}) {
  const [f, setF] = useState(existing || {
    id: genId(),
    customerName: '',
    date: today(),
    time: '',
    pickup: '',
    dropoff: '',
    driverId: '',
    driverName: '',
    assistantId: '',
    assistantName: '',
    notes: '',
    status: 'unassigned'
  });
  const [err, setErr] = useState('');
  const setDrv = id => {
    const d = drivers.find(x => x.id === id);
    setF(v => ({
      ...v,
      driverId: id,
      driverName: d?.name || '',
      status: id ? 'scheduled' : 'unassigned'
    }));
  };
  const setAsst = id => {
    const a = allStaff.find(x => x.id === id);
    setF(v => ({
      ...v,
      assistantId: id,
      assistantName: a?.name || ''
    }));
  };
  const submit = () => {
    if (!f.customerName.trim()) {
      setErr('Please enter a customer name.');
      return;
    }
    if (!f.date || !f.time) {
      setErr('Please enter a date and time.');
      return;
    }
    if (!f.pickup || !f.dropoff) {
      setErr('Please enter pickup and drop-off addresses.');
      return;
    }
    setErr('');
    onSave({
      ...f
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Customer Name"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: f.customerName,
    onChange: e => setF(v => ({
      ...v,
      customerName: e.target.value
    })),
    placeholder: "e.g. Mr Johnson"
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Date"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: inp,
    value: f.date,
    onChange: e => setF(v => ({
      ...v,
      date: e.target.value
    }))
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Time"
  }, /*#__PURE__*/React.createElement("input", {
    type: "time",
    className: inp,
    value: f.time,
    onChange: e => setF(v => ({
      ...v,
      time: e.target.value
    }))
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Pickup Address"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: f.pickup,
    onChange: e => setF(v => ({
      ...v,
      pickup: e.target.value
    })),
    placeholder: "e.g. Home address"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Drop-off Address"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: f.dropoff,
    onChange: e => setF(v => ({
      ...v,
      dropoff: e.target.value
    })),
    placeholder: "e.g. Manchester Airport, Terminal 1"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Driver"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: f.driverId,
    onChange: e => setDrv(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Unassigned"), drivers.filter(d => d.avail).map(d => /*#__PURE__*/React.createElement("option", {
    key: d.id,
    value: d.id
  }, d.name)))), /*#__PURE__*/React.createElement(Field, {
    label: "Passenger Assistant"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: f.assistantId,
    onChange: e => setAsst(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "None"), allStaff.filter(a => a.avail).map(a => /*#__PURE__*/React.createElement("option", {
    key: a.id,
    value: a.id
  }, a.name)))), /*#__PURE__*/React.createElement(Field, {
    label: "Notes"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: f.notes,
    onChange: e => setF(v => ({
      ...v,
      notes: e.target.value
    })),
    placeholder: "Any special instructions\u2026"
  })), err && /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-red-500 font-medium"
  }, err), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    className: "flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold"
  }, "Save Job")));
}

// ── SCHEDULE FORM ─────────────────────────────────────────────────────────────
function ScheduleForm({
  schedule,
  drivers,
  allStaff,
  onChange,
  onRemove,
  canRemove
}) {
  const s = schedule;
  const availD = drivers.filter(x => x.avail);
  const setPDrv = id => {
    const d = drivers.find(x => x.id === id);
    onChange({
      ...s,
      pickup: {
        ...s.pickup,
        driverId: id,
        driverName: d?.name || ''
      }
    });
  };
  const setRDrv = id => {
    const d = drivers.find(x => x.id === id);
    onChange({
      ...s,
      return: {
        ...s.return,
        driverId: id,
        driverName: d?.name || ''
      }
    });
  };
  const setPAsst = id => {
    const a = allStaff.find(x => x.id === id);
    onChange({
      ...s,
      pickup: {
        ...s.pickup,
        assistantId: id,
        assistantName: a?.name || ''
      }
    });
  };
  const setRAsst = id => {
    const a = allStaff.find(x => x.id === id);
    onChange({
      ...s,
      return: {
        ...s.return,
        assistantId: id,
        assistantName: a?.name || ''
      }
    });
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "border border-gray-200 rounded-2xl overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-gray-50 px-4 py-2.5 flex items-center justify-between border-b border-gray-200"
  }, /*#__PURE__*/React.createElement("input", {
    className: "bg-transparent text-sm font-bold text-gray-700 focus:outline-none w-40",
    value: s.label || '',
    onChange: e => onChange({
      ...s,
      label: e.target.value
    }),
    placeholder: "Schedule name\u2026"
  }), canRemove && /*#__PURE__*/React.createElement("button", {
    onClick: onRemove,
    className: "text-xs text-red-400 hover:text-red-600"
  }, "Remove")), /*#__PURE__*/React.createElement("div", {
    className: "p-4 space-y-4"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Days"
  }, /*#__PURE__*/React.createElement(DayPicker, {
    value: s.days,
    onChange: days => onChange({
      ...s,
      days
    })
  })), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-indigo-600 bg-indigo-50 rounded-xl p-3"
  }, "\uD83D\uDCC5 This schedule will repeat every week on the selected days. To make a one-day change, use ", /*#__PURE__*/React.createElement("strong", null, "Edit Today Only"), " from the runs screen."), /*#__PURE__*/React.createElement("div", {
    className: "bg-green-50 rounded-xl p-3 space-y-3 border border-green-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold text-green-700 uppercase"
  }, "\uD83C\uDFE0 Pickup"), /*#__PURE__*/React.createElement(Field, {
    label: "Time"
  }, /*#__PURE__*/React.createElement("input", {
    type: "time",
    className: inp,
    value: s.pickup.time,
    onChange: e => onChange({
      ...s,
      pickup: {
        ...s.pickup,
        time: e.target.value
      }
    })
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Pickup Address"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: s.pickup.pickup,
    onChange: e => onChange({
      ...s,
      pickup: {
        ...s.pickup,
        pickup: e.target.value
      }
    }),
    placeholder: "Home address"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Drop-off Address"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: s.pickup.dropoff,
    onChange: e => onChange({
      ...s,
      pickup: {
        ...s.pickup,
        dropoff: e.target.value
      }
    }),
    placeholder: "School address"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Driver"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: s.pickup.driverId,
    onChange: e => setPDrv(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Unassigned"), availD.map(d => /*#__PURE__*/React.createElement("option", {
    key: d.id,
    value: d.id
  }, d.name)))), /*#__PURE__*/React.createElement(Field, {
    label: "Passenger Assistant"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: s.pickup.assistantId,
    onChange: e => setPAsst(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "None"), allStaff.filter(a => a.avail).map(a => /*#__PURE__*/React.createElement("option", {
    key: a.id,
    value: a.id
  }, a.name))))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    id: `hr_${s.id}`,
    checked: s.hasReturn,
    onChange: e => onChange({
      ...s,
      hasReturn: e.target.checked
    }),
    className: "w-4 h-4 accent-sky-600"
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: `hr_${s.id}`,
    className: "text-sm font-medium text-gray-700"
  }, "Include return journey")), s.hasReturn && /*#__PURE__*/React.createElement("div", {
    className: "bg-blue-50 rounded-xl p-3 space-y-3 border border-blue-100"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold text-blue-700 uppercase"
  }, "\u21A9 Return"), /*#__PURE__*/React.createElement(Field, {
    label: "Time"
  }, /*#__PURE__*/React.createElement("input", {
    type: "time",
    className: inp,
    value: s.return.time,
    onChange: e => onChange({
      ...s,
      return: {
        ...s.return,
        time: e.target.value
      }
    })
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Pickup Address",
    hint: "Usually school"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: s.return.pickup,
    onChange: e => onChange({
      ...s,
      return: {
        ...s.return,
        pickup: e.target.value
      }
    }),
    placeholder: "e.g. School address"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Drop-off Address",
    hint: "Usually home"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: s.return.dropoff,
    onChange: e => onChange({
      ...s,
      return: {
        ...s.return,
        dropoff: e.target.value
      }
    }),
    placeholder: "e.g. Home address"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Driver"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: s.return.driverId,
    onChange: e => setRDrv(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Unassigned"), availD.map(d => /*#__PURE__*/React.createElement("option", {
    key: d.id,
    value: d.id
  }, d.name)))), /*#__PURE__*/React.createElement(Field, {
    label: "Passenger Assistant"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: s.return.assistantId,
    onChange: e => setRAsst(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "None"), allStaff.filter(a => a.avail).map(a => /*#__PURE__*/React.createElement("option", {
    key: a.id,
    value: a.id
  }, a.name)))))));
}

// ── PASSENGER FORM ────────────────────────────────────────────────────────────
function PassengerForm({
  existing,
  existingScheds,
  drivers,
  assistants,
  onSave,
  onClose
}) {
  const [p, setP] = useState(() => existing ? {
    ...existing
  } : {
    name: '',
    address: '',
    town: '',
    postcode: '',
    wheelchair: false,
    notes: '',
    archived: false
  });
  const [scheds, setScheds] = useState(() => existingScheds?.length ? existingScheds.map(s => ({
    ...s
  })) : []);
  const [err, setErr] = useState('');
  const allStaff = [...drivers, ...assistants];
  const addSchedule = () => setScheds(v => [...v, {
    ...blankSchedule(p.id || 'new', p.name, p.wheelchair),
    label: `Schedule ${v.length + 1}`
  }]);
  const updateSched = (idx, s) => setScheds(v => v.map((x, i) => i === idx ? s : x));
  const removeSched = idx => setScheds(v => v.filter((_, i) => i !== idx));
  const submit = () => {
    if (!p.name.trim()) {
      setErr('Please enter a name.');
      return;
    }
    if (!scheds.length) {
      setErr('Please add at least one schedule.');
      return;
    }
    for (const s of scheds) {
      if (!s.days.length) {
        setErr(`"${s.label}" needs at least one day.`);
        return;
      }
      if (!s.pickup.pickup || !s.pickup.dropoff) {
        setErr(`"${s.label}" needs pickup addresses.`);
        return;
      }
      if (s.hasReturn && (!s.return.pickup || !s.return.dropoff)) {
        setErr(`"${s.label}" needs return addresses.`);
        return;
      }
    }
    setErr('');
    const pId = p.id || genId();
    onSave({
      ...p,
      id: pId
    }, scheds.map(s => ({
      ...s,
      passengerId: pId,
      passengerName: p.name,
      wheelchair: p.wheelchair,
      startDate: s.startDate || today(),
      overrides: s.overrides || {},
      active: true,
      archived: false
    })));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Passenger Name"
  }, /*#__PURE__*/React.createElement("input", {
    className: `${inp} text-lg font-semibold`,
    value: p.name,
    onChange: e => setP(v => ({
      ...v,
      name: e.target.value
    })),
    placeholder: "e.g. Emma",
    autoFocus: true
  })), /*#__PURE__*/React.createElement(Field, {
    label: "First Line of Address"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: p.address || '',
    onChange: e => setP(v => ({
      ...v,
      address: e.target.value
    })),
    placeholder: "e.g. 23 Rose Street"
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Town / City"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: p.town || '',
    onChange: e => setP(v => ({
      ...v,
      town: e.target.value
    })),
    placeholder: "e.g. Didsbury"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Postcode"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: p.postcode || '',
    onChange: e => setP(v => ({
      ...v,
      postcode: e.target.value.toUpperCase()
    })),
    placeholder: "e.g. M20 2LN"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
  }, /*#__PURE__*/React.createElement("input", {
    type: "checkbox",
    id: "wc",
    checked: p.wheelchair,
    onChange: e => setP(v => ({
      ...v,
      wheelchair: e.target.checked
    })),
    className: "w-4 h-4 accent-violet-600"
  }), /*#__PURE__*/React.createElement("label", {
    htmlFor: "wc",
    className: "text-sm text-gray-700"
  }, "Requires wheelchair accessible vehicle")), /*#__PURE__*/React.createElement(Field, {
    label: "Notes"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: inp,
    rows: 2,
    value: p.notes || '',
    onChange: e => setP(v => ({
      ...v,
      notes: e.target.value
    })),
    placeholder: "e.g. special instructions"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "border-t pt-4 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold text-gray-400 uppercase tracking-widest"
  }, "\uD83D\uDCC5 Schedules"), /*#__PURE__*/React.createElement("button", {
    onClick: addSchedule,
    className: "text-xs px-3 py-1.5 bg-sky-600 text-white rounded-full font-bold"
  }, "+ Add Schedule")), !scheds.length && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-6 border-2 border-dashed border-gray-200 rounded-2xl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-gray-400 text-sm mb-2"
  }, "No schedules yet"), /*#__PURE__*/React.createElement("button", {
    onClick: addSchedule,
    className: "text-xs px-4 py-2 bg-sky-600 text-white rounded-full font-bold"
  }, "+ Add First Schedule")), scheds.map((s, i) => /*#__PURE__*/React.createElement(ScheduleForm, {
    key: s.id,
    schedule: s,
    drivers: drivers,
    allStaff: allStaff,
    onChange: ns => updateSched(i, ns),
    onRemove: () => removeSched(i),
    canRemove: scheds.length > 1
  }))), err && /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-red-500 font-medium bg-red-50 rounded-xl p-3"
  }, err), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    className: "flex-1 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold"
  }, "Save Passenger")));
}

// ── STAFF FORM ────────────────────────────────────────────────────────────────
function StaffForm({
  existing,
  isAsst,
  allDrivers,
  onSave,
  onClose
}) {
  const [f, setF] = useState(() => existing ? {
    ...existing
  } : isAsst ? {
    name: '',
    address: '',
    town: '',
    postcode: '',
    phone: '',
    avail: true
  } : {
    name: '',
    address: '',
    town: '',
    postcode: '',
    phone: '',
    avail: true,
    pin: ''
  });
  const [pinErr, setPinErr] = useState('');
  const submit = () => {
    if (!isAsst) {
      if (!f.pin || f.pin.length !== 6 || !/^\d+$/.test(f.pin)) {
        setPinErr('PIN must be exactly 6 digits.');
        return;
      }
      const dupe = allDrivers.find(d => d.pin === f.pin && d.id !== f.id);
      if (dupe) {
        setPinErr(`PIN already in use by ${dupe.name}.`);
        return;
      }
    }
    setPinErr('');
    onSave({
      ...f,
      id: f.id || genId()
    });
  };
  return /*#__PURE__*/React.createElement(Modal, {
    title: existing ? isAsst ? 'Edit Assistant' : 'Edit Driver' : isAsst ? 'Add Assistant' : 'Add Driver',
    onClose: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Full Name"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: f.name || '',
    onChange: e => setF(v => ({
      ...v,
      name: e.target.value
    }))
  })), /*#__PURE__*/React.createElement(Field, {
    label: "First Line of Address"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: f.address || '',
    onChange: e => setF(v => ({
      ...v,
      address: e.target.value
    })),
    placeholder: "e.g. 14 Oak Street"
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Town / City"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: f.town || '',
    onChange: e => setF(v => ({
      ...v,
      town: e.target.value
    }))
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Postcode"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: f.postcode || '',
    onChange: e => setF(v => ({
      ...v,
      postcode: e.target.value.toUpperCase()
    })),
    placeholder: "e.g. M20 1AA"
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Phone"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: f.phone || '',
    onChange: e => setF(v => ({
      ...v,
      phone: e.target.value
    }))
  })), !isAsst && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Field, {
    label: "6-Digit PIN",
    hint: "Driver uses this to log in \u2014 must be unique"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    type: "password",
    maxLength: 6,
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022",
    value: f.pin || '',
    onChange: e => setF(v => ({
      ...v,
      pin: e.target.value.replace(/\D/g, '').slice(0, 6)
    }))
  }), pinErr && /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-red-500 mt-1"
  }, pinErr))), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    className: "flex-1 py-2.5 border rounded-xl text-sm text-gray-600"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    className: "flex-1 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold"
  }, "Save"))));
}

// ── BY DRIVER VIEW ────────────────────────────────────────────────────────────
function StaffScheduleTable({
  items,
  staffList,
  staffKey,
  label
}) {
  // Build rows: one per staff member, runs flowing left to right in time order
  const activeItems = items.filter(r => r.status !== 'cancelled' && r.status !== 'holiday');
  const usedIds = [...new Set(activeItems.map(r => r[staffKey]).filter(Boolean))];
  const unassigned = activeItems.filter(r => !r[staffKey]);
  // Find max runs any one person has — determines number of time/passenger column pairs
  const maxRuns = usedIds.reduce((max, id) => {
    const count = activeItems.filter(r => r[staffKey] === id).length;
    return count > max ? count : max;
  }, 0);
  const cols = Math.max(maxRuns, 1);
  if (!usedIds.length) return /*#__PURE__*/React.createElement("div", {
    className: "text-center py-12 text-gray-400 text-sm"
  }, "No ", label.toLowerCase(), " assigned for this date.");
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, unassigned.length > 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-xs bg-amber-50 text-amber-700 rounded-xl px-3 py-2 font-semibold border border-amber-200"
  }, "\u26A0\uFE0F ", unassigned.length, " run", unassigned.length !== 1 ? 's' : '', " have no ", label.toLowerCase(), " assigned"), /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto rounded-2xl shadow-sm border border-gray-100 bg-white"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "bg-gray-50 border-b border-gray-100"
  }, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", {
    className: "text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap sticky left-0 bg-gray-50"
  }, label), Array(cols).fill(0).map((_, i) => /*#__PURE__*/React.createElement("th", {
    key: i,
    colSpan: 2,
    className: "text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide border-l border-gray-100"
  }, "Run ", i + 1))), /*#__PURE__*/React.createElement("tr", {
    className: "border-b border-gray-100"
  }, /*#__PURE__*/React.createElement("th", {
    className: "sticky left-0 bg-gray-50"
  }), Array(cols).fill(0).map((_, i) => [/*#__PURE__*/React.createElement("th", {
    key: `t${i}`,
    className: "px-3 py-2 text-xs font-semibold text-gray-400 border-l border-gray-100 whitespace-nowrap"
  }, "Time"), /*#__PURE__*/React.createElement("th", {
    key: `p${i}`,
    className: "px-3 py-2 text-xs font-semibold text-gray-400 whitespace-nowrap"
  }, "Passenger")]))), /*#__PURE__*/React.createElement("tbody", null, usedIds.map((id, rowIdx) => {
    const person = staffList.find(s => s.id === id);
    const runs = activeItems.filter(r => r[staffKey] === id).sort((a, b) => a.time.localeCompare(b.time));
    const stripe = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
    return /*#__PURE__*/React.createElement("tr", {
      key: id,
      className: `${stripe} border-b border-gray-50 hover:bg-sky-50/20`
    }, /*#__PURE__*/React.createElement("td", {
      className: `px-4 py-3 font-bold text-gray-800 whitespace-nowrap sticky left-0 ${stripe} border-r border-gray-100`
    }, person?.name || 'Unknown'), Array(cols).fill(0).map((_, i) => {
      const run = runs[i];
      return run ? [/*#__PURE__*/React.createElement("td", {
        key: `t${i}`,
        className: "px-3 py-3 whitespace-nowrap border-l border-gray-100"
      }, /*#__PURE__*/React.createElement("div", {
        className: "font-bold text-sky-700 text-sm"
      }, fmt(run.time)), /*#__PURE__*/React.createElement("span", {
        className: `text-xs px-1.5 py-0.5 rounded-full font-bold ${run.type === 'return' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`
      }, run.type === 'return' ? '↩' : '🏠')), /*#__PURE__*/React.createElement("td", {
        key: `p${i}`,
        className: "px-3 py-3 whitespace-nowrap"
      }, /*#__PURE__*/React.createElement("div", {
        className: "font-semibold text-gray-700 text-sm"
      }, run.passengerName || run.customerName), run.wheelchair && /*#__PURE__*/React.createElement("span", {
        className: "text-xs text-violet-500"
      }, "\u267F"), run.kind === 'job' && /*#__PURE__*/React.createElement("span", {
        className: "text-xs text-orange-500"
      }, "\u2708\uFE0F"))] : [/*#__PURE__*/React.createElement("td", {
        key: `t${i}`,
        className: "border-l border-gray-100"
      }), /*#__PURE__*/React.createElement("td", {
        key: `p${i}`
      })];
    }));
  })))));
}
function ByDriverView({
  items,
  drivers,
  assistants
}) {
  const [staffTab, setStaffTab] = useState('drivers');
  const allStaff = [...drivers, ...assistants];
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-xl border border-gray-200 p-0.5 flex gap-0.5 w-fit"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setStaffTab('drivers'),
    className: `px-4 py-1.5 rounded-lg text-xs font-bold ${staffTab === 'drivers' ? 'bg-sky-600 text-white' : 'text-gray-500'}`
  }, "\uD83D\uDC64 Drivers"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setStaffTab('assistants'),
    className: `px-4 py-1.5 rounded-lg text-xs font-bold ${staffTab === 'assistants' ? 'bg-sky-600 text-white' : 'text-gray-500'}`
  }, "\uD83E\uDD1D Assistants")), staffTab === 'drivers' && /*#__PURE__*/React.createElement(StaffScheduleTable, {
    items: items,
    staffList: drivers,
    staffKey: "driverId",
    label: "Driver"
  }), staffTab === 'assistants' && /*#__PURE__*/React.createElement(StaffScheduleTable, {
    items: items,
    staffList: allStaff,
    staffKey: "assistantId",
    label: "Assistant"
  }));
}

// ── TABLE VIEW ────────────────────────────────────────────────────────────────
function TableView({
  items,
  onEdit,
  onCharge,
  onReinstate,
  schedules,
  now
}) {
  if (!items.length) return /*#__PURE__*/React.createElement("div", {
    className: "text-center py-16 text-gray-400"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-4xl mb-2"
  }, "\uD83D\uDCCB"), /*#__PURE__*/React.createElement("div", null, "No runs scheduled for this date."));
  return /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto rounded-2xl shadow-sm border border-gray-100 bg-white"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-sm min-w-[700px]"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "bg-gray-50 border-b border-gray-100"
  }, /*#__PURE__*/React.createElement("tr", null, ['Time', 'Type', 'Passenger', 'From', 'To', 'Driver', 'Assistant', 'Status', ''].map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    className: "text-left px-3 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap"
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, items.map((item, i) => {
    const cancelled = item.status === 'cancelled';
    const holiday = item.status === 'holiday';
    const isJob = item.kind === 'job';
    const stripe = i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40';
    const canUndo = cancelled && item.cancelledAt && now - new Date(item.cancelledAt).getTime() < 10 * 60 * 1000;
    return /*#__PURE__*/React.createElement("tr", {
      key: item.id,
      className: `${stripe} border-b border-gray-50 ${cancelled || holiday ? 'opacity-60' : ''}`
    }, /*#__PURE__*/React.createElement("td", {
      className: "px-3 py-3 font-bold text-sky-700 whitespace-nowrap"
    }, fmt(item.time)), /*#__PURE__*/React.createElement("td", {
      className: "px-3 py-3 whitespace-nowrap"
    }, isJob ? /*#__PURE__*/React.createElement("span", {
      className: "text-xs px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700"
    }, "\u2708\uFE0F Job") : /*#__PURE__*/React.createElement("span", {
      className: `text-xs px-2 py-0.5 rounded-full font-bold ${item.type === 'return' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`
    }, item.type === 'return' ? '↩ Return' : '🏠 Pickup')), /*#__PURE__*/React.createElement("td", {
      className: "px-3 py-3 font-semibold text-gray-800 whitespace-nowrap"
    }, item.passengerName || item.customerName, item.wheelchair && /*#__PURE__*/React.createElement("span", {
      className: "ml-1 text-violet-500"
    }, "\u267F"), item.scheduleLabel && /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-gray-400 font-normal"
    }, item.scheduleLabel)), /*#__PURE__*/React.createElement("td", {
      className: "px-3 py-3 text-xs text-gray-500 max-w-[120px]"
    }, /*#__PURE__*/React.createElement("div", {
      className: "truncate"
    }, item.pickup)), /*#__PURE__*/React.createElement("td", {
      className: "px-3 py-3 text-xs text-gray-500 max-w-[120px]"
    }, /*#__PURE__*/React.createElement("div", {
      className: "truncate"
    }, item.dropoff)), /*#__PURE__*/React.createElement("td", {
      className: "px-3 py-3 text-xs whitespace-nowrap"
    }, item.driverName || /*#__PURE__*/React.createElement("span", {
      className: "text-amber-600 font-semibold"
    }, "Unassigned")), /*#__PURE__*/React.createElement("td", {
      className: "px-3 py-3 text-xs text-gray-500 whitespace-nowrap"
    }, item.assistantName || '—'), /*#__PURE__*/React.createElement("td", {
      className: "px-3 py-3"
    }, holiday ? /*#__PURE__*/React.createElement("span", {
      className: "text-xs px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700 border border-purple-200"
    }, "\uD83C\uDFEB ", item.holidayName) : /*#__PURE__*/React.createElement(Badge, {
      s: item.status,
      chargeStatus: item.chargeStatus
    }), cancelled && item.cancelNote && /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-gray-400 mt-1 max-w-[100px] truncate",
      title: item.cancelNote
    }, "\uD83D\uDCDD ", item.cancelNote)), /*#__PURE__*/React.createElement("td", {
      className: "px-3 py-3 whitespace-nowrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col gap-1"
    }, cancelled && !item.chargeStatus && /*#__PURE__*/React.createElement("button", {
      onClick: () => onCharge(item),
      className: "text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-lg font-semibold"
    }, "Set charge"), cancelled && item.chargeStatus && /*#__PURE__*/React.createElement("button", {
      onClick: () => onCharge(item),
      className: "text-xs text-gray-400 hover:text-orange-600 px-2 py-1"
    }, "Edit charge"), cancelled && /*#__PURE__*/React.createElement("button", {
      onClick: () => onReinstate(item),
      className: "text-xs bg-green-100 text-green-700 px-2 py-1 rounded-lg font-semibold"
    }, "Reinstate"), !cancelled && !holiday && /*#__PURE__*/React.createElement("button", {
      onClick: () => onEdit(item),
      className: "text-xs text-sky-600 font-semibold"
    }, "Edit"))));
  }))));
}

// ── CARDS VIEW ────────────────────────────────────────────────────────────────
function CardsView({
  items,
  onEdit,
  onCharge,
  onReinstate,
  now
}) {
  if (!items.length) return /*#__PURE__*/React.createElement("div", {
    className: "text-center py-16 text-gray-400"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-5xl mb-3"
  }, "\uD83D\uDE90"), /*#__PURE__*/React.createElement("div", null, "No runs for this date."));
  const border = {
    unassigned: 'border-l-amber-400',
    scheduled: 'border-l-sky-500',
    cancelled: 'border-l-red-400',
    holiday: 'border-l-purple-400',
    job: 'border-l-orange-400'
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, items.map(item => {
    const cancelled = item.status === 'cancelled';
    const holiday = item.status === 'holiday';
    const isJob = item.kind === 'job';
    return /*#__PURE__*/React.createElement("div", {
      key: item.id,
      className: `bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${border[item.status] || border.unassigned} p-4 space-y-2 ${cancelled || holiday ? 'opacity-70' : ''}`
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-start"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 flex-wrap"
    }, /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-sky-700"
    }, fmt(item.time)), isJob ? /*#__PURE__*/React.createElement("span", {
      className: "text-xs px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700"
    }, "\u2708\uFE0F One-off Job") : /*#__PURE__*/React.createElement("span", {
      className: `text-xs px-2 py-0.5 rounded-full font-bold ${item.type === 'return' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`
    }, item.type === 'return' ? '↩ Return' : '🏠 Pickup'), item.wheelchair && /*#__PURE__*/React.createElement("span", {
      className: "text-xs bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full"
    }, "\u267F")), holiday ? /*#__PURE__*/React.createElement("span", {
      className: "text-xs px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700 border border-purple-200"
    }, "\uD83C\uDFEB ", item.holidayName) : /*#__PURE__*/React.createElement(Badge, {
      s: item.status,
      chargeStatus: item.chargeStatus
    })), /*#__PURE__*/React.createElement("div", {
      className: "font-semibold text-gray-800"
    }, item.passengerName || item.customerName, item.scheduleLabel && /*#__PURE__*/React.createElement("span", {
      className: "ml-2 text-xs text-gray-400 font-normal"
    }, item.scheduleLabel)), !holiday && /*#__PURE__*/React.createElement("div", {
      className: "space-y-1.5 text-sm"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-green-50 rounded-xl p-2.5 space-y-0.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-xs font-bold text-green-700"
    }, "From"), /*#__PURE__*/React.createElement("div", {
      className: "text-green-800"
    }, item.pickup), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-gray-600"
    }, "\uD83D\uDC64 ", item.driverName || /*#__PURE__*/React.createElement("span", {
      className: "text-amber-600"
    }, "No driver"), " \xB7 \uD83E\uDD1D ", item.assistantName || 'No assistant')), /*#__PURE__*/React.createElement("div", {
      className: "bg-blue-50 rounded-xl p-2.5 space-y-0.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-xs font-bold text-blue-700"
    }, "To"), /*#__PURE__*/React.createElement("div", {
      className: "text-blue-800"
    }, item.dropoff))), cancelled && item.cancelNote && /*#__PURE__*/React.createElement("div", {
      className: "text-xs bg-red-50 text-red-600 rounded-xl p-2"
    }, "\uD83D\uDCDD ", item.cancelNote), !cancelled && !holiday && /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2 pt-1"
    }, /*#__PURE__*/React.createElement("a", {
      href: mapsUrl(item.pickup, item.dropoff),
      target: "_blank",
      rel: "noreferrer",
      className: "flex-1 text-center text-xs py-2 rounded-xl bg-sky-50 text-sky-700 font-semibold"
    }, "\uD83D\uDDFA Map"), /*#__PURE__*/React.createElement("button", {
      onClick: () => onEdit(item),
      className: "flex-1 text-xs py-2 rounded-xl bg-gray-50 text-gray-600 font-semibold"
    }, "\u270F\uFE0F Edit")), cancelled && /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2 pt-1"
    }, !item.chargeStatus && /*#__PURE__*/React.createElement("button", {
      onClick: () => onCharge(item),
      className: "flex-1 py-2 bg-orange-100 text-orange-700 rounded-xl text-xs font-bold"
    }, "\uD83D\uDCB0 Set charge"), item.chargeStatus && /*#__PURE__*/React.createElement("button", {
      onClick: () => onCharge(item),
      className: "flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-semibold"
    }, "Edit charge"), /*#__PURE__*/React.createElement("button", {
      onClick: () => onReinstate(item),
      className: "flex-1 py-2 bg-green-100 text-green-700 rounded-xl text-xs font-bold"
    }, "\u2713 Reinstate")));
  }));
}

// ── DRIVER VIEW ───────────────────────────────────────────────────────────────
function DriverView({
  driver,
  schedules,
  oneoffs,
  jobs,
  holidays,
  onCancel,
  onUndo,
  onLogout,
  onUpdateProfile
}) {
  const [date, setDate] = useState(today());
  const [driverTab, setDriverTab] = useState('runs');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profile, setProfile] = useState({
    address: driver.address || '',
    town: driver.town || '',
    postcode: driver.postcode || '',
    phone: driver.phone || ''
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const tomorrow = addDays(today(), 1);
  const allRuns = useMemo(() => computeRuns(schedules, oneoffs, jobs, date, holidays).filter(r => r.driverId === driver.id).sort((a, b) => a.time.localeCompare(b.time)), [schedules, oneoffs, jobs, date, driver.id, holidays]);
  const getHasReturn = run => {
    if (run.type !== 'pickup') return false;
    const sch = schedules.find(s => s.id === run.scheduleId);
    return sch?.hasReturn && !(sch.overrides?.[run.date] || {}).returnCancelled;
  };
  const handleCancel = (run, note, cancelReturn) => {
    onCancel(run, note, cancelReturn);
    setCancelTarget(null);
  };
  const saveProfile = () => {
    onUpdateProfile(driver.id, profile);
    setEditingProfile(false);
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-slate-50"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-gradient-to-r from-sky-700 to-indigo-700 text-white px-4 pt-5 pb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-lg mx-auto flex items-center justify-between mb-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "font-black text-xl"
  }, "\uD83D\uDE90 Pembrokeshire Taxis"), /*#__PURE__*/React.createElement("div", {
    className: "text-sky-200 text-sm"
  }, "\uD83D\uDC64 ", driver.name)), /*#__PURE__*/React.createElement("button", {
    onClick: onLogout,
    className: "text-xs bg-white/20 px-3 py-1.5 rounded-full hover:bg-white/30"
  }, "Log out")), driverTab === 'runs' && /*#__PURE__*/React.createElement("div", {
    className: "max-w-lg mx-auto"
  }, /*#__PURE__*/React.createElement(DateNav, {
    date: date,
    onChange: setDate,
    limitToTomorrow: true
  }))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-lg mx-auto flex"
  }, [{
    id: 'runs',
    l: '📋 My Runs'
  }, {
    id: 'profile',
    l: '👤 My Profile'
  }].map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setDriverTab(t.id),
    className: `flex-1 py-3 text-xs font-bold transition-colors ${driverTab === t.id ? 'border-b-2 border-sky-600 text-sky-700' : 'text-gray-400 hover:text-gray-600'}`
  }, t.l)))), /*#__PURE__*/React.createElement("div", {
    className: "max-w-lg mx-auto px-4 py-4 space-y-3"
  }, driverTab === 'runs' && /*#__PURE__*/React.createElement(React.Fragment, null, allRuns.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-16 text-gray-400"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-5xl mb-3"
  }, "\u2600\uFE0F"), /*#__PURE__*/React.createElement("div", {
    className: "font-semibold"
  }, "No runs assigned for this day.")), allRuns.map(run => {
    const cancelled = run.status === 'cancelled';
    const holiday = run.status === 'holiday';
    const canUndo = cancelled && run.cancelledAt && now - new Date(run.cancelledAt).getTime() < 10 * 60 * 1000;
    const undoSecsLeft = canUndo ? Math.ceil((10 * 60 * 1000 - (now - new Date(run.cancelledAt).getTime())) / 1000) : 0;
    return /*#__PURE__*/React.createElement("div", {
      key: run.id,
      className: `bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 ${holiday ? 'border-l-purple-400' : cancelled ? 'border-l-red-400 opacity-80' : 'border-l-sky-500'} p-4 space-y-3`
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-start"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 flex-wrap"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-2xl font-black text-sky-700"
    }, fmt(run.time)), holiday ? /*#__PURE__*/React.createElement("span", {
      className: "text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold"
    }, "\uD83C\uDFEB ", run.holidayName) : /*#__PURE__*/React.createElement("span", {
      className: `text-xs px-2 py-0.5 rounded-full font-bold ${run.type === 'return' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`
    }, run.type === 'return' ? '↩ Return' : '🏠 Pickup'), run.wheelchair && /*#__PURE__*/React.createElement("span", {
      className: "text-xs bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full font-bold"
    }, "\u267F")), cancelled && /*#__PURE__*/React.createElement("span", {
      className: "text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-semibold border border-red-200"
    }, "Cancelled")), /*#__PURE__*/React.createElement("div", {
      className: "font-bold text-gray-800 text-lg"
    }, run.passengerName), !cancelled && !holiday && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      className: "text-sm bg-indigo-50 text-indigo-700 rounded-xl px-3 py-2 font-medium"
    }, "\uD83E\uDD1D Passenger assistant: ", run.assistantName || 'None'), /*#__PURE__*/React.createElement("div", {
      className: "space-y-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2 items-start p-2.5 bg-green-50 rounded-xl text-green-800 text-sm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "shrink-0 mt-0.5"
    }, "\uD83C\uDFE0"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", {
      className: "block text-xs opacity-60 uppercase mb-0.5"
    }, "Pick up from"), run.pickup)), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2 items-start p-2.5 bg-blue-50 rounded-xl text-blue-800 text-sm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "shrink-0 mt-0.5"
    }, "\uD83D\uDCCD"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", {
      className: "block text-xs opacity-60 uppercase mb-0.5"
    }, "Drop off at"), run.dropoff))), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2"
    }, /*#__PURE__*/React.createElement("a", {
      href: mapsUrl(run.pickup, run.dropoff),
      target: "_blank",
      rel: "noreferrer",
      className: "flex-1 text-center py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold"
    }, "\uD83D\uDDFA Open in Maps"), /*#__PURE__*/React.createElement("button", {
      onClick: () => setCancelTarget(run),
      className: "flex-1 py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-semibold border border-red-100"
    }, "\u2715 Cancel"))), cancelled && /*#__PURE__*/React.createElement(React.Fragment, null, run.cancelNote && /*#__PURE__*/React.createElement("div", {
      className: "text-xs bg-red-50 text-red-600 rounded-xl p-2"
    }, "\uD83D\uDCDD ", run.cancelNote), canUndo && /*#__PURE__*/React.createElement("button", {
      onClick: () => onUndo(run),
      className: "w-full py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold"
    }, "\u21A9 Undo Cancellation (", Math.floor(undoSecsLeft / 60), ":", String(undoSecsLeft % 60).padStart(2, '0'), " left)")), holiday && /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-purple-600 bg-purple-50 rounded-xl p-2"
    }, "No run today due to ", run.holidayName, ". Your manager will confirm any changes."), run.notes && !cancelled && !holiday && /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-amber-700 bg-amber-50 rounded-xl p-2"
    }, "\uD83D\uDCDD ", run.notes));
  })), driverTab === 'profile' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-bold text-gray-800 text-lg"
  }, driver.name), /*#__PURE__*/React.createElement("button", {
    onClick: () => setEditingProfile(!editingProfile),
    className: "text-xs text-sky-600 font-semibold"
  }, editingProfile ? 'Cancel' : 'Edit')), /*#__PURE__*/React.createElement("div", {
    className: "text-xs bg-gray-100 text-gray-500 px-3 py-1.5 rounded-full w-fit"
  }, "\uD83D\uDC64 Driver"), !editingProfile && /*#__PURE__*/React.createElement("div", {
    className: "space-y-1 text-sm text-gray-600"
  }, /*#__PURE__*/React.createElement("div", null, "\uD83C\uDFE0 ", [driver.address, driver.town, driver.postcode].filter(Boolean).join(', ') || 'No address on file'), /*#__PURE__*/React.createElement("div", null, "\uD83D\uDCDE ", driver.phone || 'No phone on file')), editingProfile && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "First Line of Address"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: profile.address,
    onChange: e => setProfile(v => ({
      ...v,
      address: e.target.value
    })),
    placeholder: "e.g. 14 Oak Street"
  })), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "Town / City"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: profile.town,
    onChange: e => setProfile(v => ({
      ...v,
      town: e.target.value
    }))
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Postcode"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: profile.postcode,
    onChange: e => setProfile(v => ({
      ...v,
      postcode: e.target.value.toUpperCase()
    }))
  }))), /*#__PURE__*/React.createElement(Field, {
    label: "Phone"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: profile.phone,
    onChange: e => setProfile(v => ({
      ...v,
      phone: e.target.value
    }))
  })), /*#__PURE__*/React.createElement("button", {
    onClick: saveProfile,
    className: "w-full py-2.5 bg-sky-600 text-white rounded-xl text-sm font-bold"
  }, "Save Profile"))), /*#__PURE__*/React.createElement("button", {
    className: "w-full py-3 bg-gray-100 text-gray-500 rounded-2xl font-bold text-sm border-2 border-dashed border-gray-200",
    onClick: () => alert('Document storage coming soon! This feature will be available in a future update.')
  }, "\uD83D\uDCC4 Add Documents \u2014 Coming Soon"))), cancelTarget && /*#__PURE__*/React.createElement(DriverCancelModal, {
    run: cancelTarget,
    hasReturn: getHasReturn(cancelTarget),
    onConfirm: (note, cr) => handleCancel(cancelTarget, note, cr),
    onClose: () => setCancelTarget(null)
  }));
}

// ── SETTINGS TAB ──────────────────────────────────────────────────────────────
// ── REPORTS TAB ───────────────────────────────────────────────────────────────
function ReportsTab({
  schedules,
  oneoffs,
  jobs,
  drivers,
  assistants,
  passengers
}) {
  const [reportType, setReportType] = useState('');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(today());
  const [selPassenger, setSelPassenger] = useState('all');
  const [preview, setPreview] = useState(null);
  const activePassengers = passengers.filter(p => !p.archived);

  // Generate all runs between two dates
  const getRunsInRange = () => {
    const runs = [];
    let d = startDate;
    while (d <= endDate) {
      runs.push(...computeRunsForReport(schedules, oneoffs, d));
      d = addDays(d, 1);
    }
    return runs;
  };

  // Simplified compute for reports — no holiday suppression needed, just raw runs
  const computeRunsForReport = (scheds, offs, date) => {
    const dow = getDOW(date),
      out = [];
    for (const s of scheds) {
      if (!s.active || s.archived || s.startDate > date) continue;
      if (s.endDate && s.endDate < date) continue;
      if (!s.days.includes(dow)) continue;
      const ov = s.overrides?.[date] || {};
      const cancelled = ov.pickupCancelled;
      const dId = ov.pickupDriver?.id ?? s.pickup.driverId,
        dNm = ov.pickupDriver?.name ?? s.pickup.driverName;
      const aId = ov.pickupAsst?.id ?? s.pickup.assistantId,
        aNm = ov.pickupAsst?.name ?? s.pickup.assistantName;
      out.push({
        date,
        type: 'pickup',
        passengerName: s.passengerName,
        passengerId: s.passengerId,
        driverName: dNm || 'Unassigned',
        assistantName: aNm || '',
        pickup: ov.pickupAddress || s.pickup.pickup,
        dropoff: ov.pickupDropoff || s.pickup.dropoff,
        status: cancelled ? 'cancelled' : 'scheduled',
        cancelNote: ov.cancelNote || '',
        chargeStatus: ov.chargeStatus || ''
      });
      if (s.hasReturn) {
        const rCancelled = ov.returnCancelled;
        const rdId = ov.returnDriver?.id ?? s.return.driverId,
          rdNm = ov.returnDriver?.name ?? s.return.driverName;
        const raId = ov.returnAsst?.id ?? s.return.assistantId,
          raNm = ov.returnAsst?.name ?? s.return.assistantName;
        out.push({
          date,
          type: 'return',
          passengerName: s.passengerName,
          passengerId: s.passengerId,
          driverName: rdNm || 'Unassigned',
          assistantName: raNm || '',
          pickup: ov.returnAddress || s.return.pickup,
          dropoff: ov.returnDropoff || s.return.dropoff,
          status: rCancelled ? 'cancelled' : 'scheduled',
          cancelNote: ov.returnCancelNote || '',
          chargeStatus: ov.returnChargeStatus || ''
        });
      }
    }
    out.push(...offs.filter(r => r.date === date));
    return out;
  };
  const toCSV = (headers, rows) => {
    const escape = v => `"${String(v || '').replace(/"/g, '""')}"`;
    return [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  };
  const downloadCSV = (csv, filename) => {
    const blob = new Blob([csv], {
      type: 'text/csv'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const generateDriverReport = () => {
    const runs = getRunsInRange().filter(r => r.status !== 'cancelled');
    const jobsInRange = jobs.filter(j => j.date >= startDate && j.date <= endDate && j.status !== 'cancelled');
    const summary = {};
    drivers.forEach(d => {
      summary[d.id] = {
        name: d.name,
        runs: 0,
        pickups: 0,
        returns: 0,
        jobs: 0
      };
    });
    runs.forEach(r => {
      const d = drivers.find(x => x.name === r.driverName);
      if (d && summary[d.id]) {
        summary[d.id].runs++;
        r.type === 'pickup' ? summary[d.id].pickups++ : summary[d.id].returns++;
      }
    });
    jobsInRange.forEach(j => {
      const d = drivers.find(x => x.id === j.driverId);
      if (d && summary[d.id]) {
        summary[d.id].runs++;
        summary[d.id].jobs++;
      }
    });
    const rows = Object.values(summary).filter(s => s.runs > 0).map(s => [s.name, s.runs, s.pickups, s.returns, s.jobs]);
    const headers = ['Driver', 'Total Runs', 'Pickups', 'Returns', 'One-off Jobs'];
    setPreview({
      headers,
      rows,
      filename: `driver_runs_${startDate}_to_${endDate}.csv`
    });
  };
  const generateCancellationsReport = () => {
    const runs = getRunsInRange().filter(r => r.status === 'cancelled');
    const rows = runs.map(r => [prettyDate(r.date), r.passengerName, r.type === 'pickup' ? 'Pickup' : 'Return', r.driverName, r.cancelNote || '', r.chargeStatus === 'charged' ? 'Charged' : r.chargeStatus === 'no-charge' ? 'No Charge' : 'Pending']);
    const headers = ['Date', 'Passenger', 'Type', 'Driver', 'Reason', 'Charge Status'];
    setPreview({
      headers,
      rows,
      filename: `cancellations_${startDate}_to_${endDate}.csv`
    });
  };
  const generatePassengerReport = () => {
    const allRuns = getRunsInRange();
    const filtered = selPassenger === 'all' ? allRuns : allRuns.filter(r => r.passengerId === selPassenger);
    const rows = filtered.map(r => [prettyDate(r.date), r.passengerName, r.type === 'pickup' ? 'Pickup' : 'Return', r.driverName, r.assistantName || 'None', r.pickup, r.dropoff, r.status === 'cancelled' ? 'Cancelled' : 'Completed', r.chargeStatus || '']);
    const headers = ['Date', 'Passenger', 'Type', 'Driver', 'Assistant', 'From', 'To', 'Status', 'Charge'];
    setPreview({
      headers,
      rows,
      filename: `passenger_runs_${startDate}_to_${endDate}.csv`
    });
  };
  const generateDailySheet = () => {
    const runs = computeRunsForReport(schedules, oneoffs, startDate);
    const jobsToday = jobs.filter(j => j.date === startDate);
    const allItems = [...runs, ...jobsToday.map(j => ({
      date: j.date,
      type: 'job',
      passengerName: j.customerName,
      driverName: j.driverName || 'Unassigned',
      assistantName: j.assistantName || '',
      pickup: j.pickup,
      dropoff: j.dropoff,
      status: j.status,
      cancelNote: '',
      chargeStatus: ''
    }))].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const rows = allItems.map(r => [r.type === 'job' ? 'One-off Job' : r.type === 'pickup' ? 'Pickup' : 'Return', r.passengerName, r.driverName, r.assistantName || 'None', r.pickup, r.dropoff, r.status === 'cancelled' ? 'Cancelled' : 'Scheduled']);
    const headers = ['Type', 'Passenger / Customer', 'Driver', 'Assistant', 'From', 'To', 'Status'];
    setPreview({
      headers,
      rows,
      filename: `daily_runsheet_${startDate}.csv`
    });
  };
  const generate = () => {
    setPreview(null);
    if (reportType === 'driver') generateDriverReport();else if (reportType === 'cancellations') generateCancellationsReport();else if (reportType === 'passenger') generatePassengerReport();else if (reportType === 'daily') generateDailySheet();
  };
  const reports = [{
    id: 'driver',
    icon: '👤',
    label: 'Driver Runs Report',
    desc: 'Total runs per driver in a date range — useful for wages'
  }, {
    id: 'cancellations',
    icon: '❌',
    label: 'Cancellations Report',
    desc: 'All cancellations with charged/no charge status — useful for invoicing'
  }, {
    id: 'passenger',
    icon: '🎒',
    label: 'Passenger Runs Report',
    desc: 'All runs for one or all passengers — useful for council invoicing'
  }, {
    id: 'daily',
    icon: '📅',
    label: 'Daily Run Sheet',
    desc: 'All runs for a single day — printable daily summary'
  }, {
    id: 'communications',
    icon: '🏛️',
    label: 'Council Communications Report',
    desc: 'All council notes and messages per passenger — coming in Phase 2',
    disabled: true
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold text-gray-400 uppercase tracking-widest px-1"
  }, "Select Report"), reports.map(r => /*#__PURE__*/React.createElement("button", {
    key: r.id,
    onClick: () => {
      if (!r.disabled) {
        setReportType(r.id);
        setPreview(null);
      }
    },
    className: `w-full flex items-center gap-4 px-4 py-3 rounded-2xl border-2 text-left transition-all ${r.disabled ? 'border-indigo-100 bg-indigo-50/50 cursor-default' : reportType === r.id ? 'border-sky-500 bg-sky-50' : 'border-gray-200 bg-white hover:border-sky-200'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-2xl"
  }, r.icon), /*#__PURE__*/React.createElement("div", {
    className: "flex-1"
  }, /*#__PURE__*/React.createElement("div", {
    className: `font-bold text-sm ${r.disabled ? 'text-indigo-400' : reportType === r.id ? 'text-sky-700' : 'text-gray-700'}`
  }, r.label), /*#__PURE__*/React.createElement("div", {
    className: `text-xs mt-0.5 ${r.disabled ? 'text-indigo-400' : reportType === r.id ? 'text-sky-500' : 'text-gray-400'}`
  }, r.desc)), r.disabled && /*#__PURE__*/React.createElement("span", {
    className: "text-xs bg-indigo-100 text-indigo-500 px-2 py-1 rounded-full font-semibold shrink-0"
  }, "Phase 2"), !r.disabled && reportType === r.id && /*#__PURE__*/React.createElement("span", {
    className: "text-sky-500 text-lg shrink-0"
  }, "\u2713")))), reportType && /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold text-gray-400 uppercase tracking-widest"
  }, "Date Range"), reportType === 'daily' ? /*#__PURE__*/React.createElement(Field, {
    label: "Date"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: inp,
    value: startDate,
    onChange: e => setStartDate(e.target.value)
  })) : /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-3"
  }, /*#__PURE__*/React.createElement(Field, {
    label: "From"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: inp,
    value: startDate,
    onChange: e => setStartDate(e.target.value)
  })), /*#__PURE__*/React.createElement(Field, {
    label: "To"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: inp,
    value: endDate,
    onChange: e => setEndDate(e.target.value)
  }))), reportType === 'passenger' && /*#__PURE__*/React.createElement(Field, {
    label: "Passenger"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: selPassenger,
    onChange: e => setSelPassenger(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "Select All Passengers"), activePassengers.map(p => /*#__PURE__*/React.createElement("option", {
    key: p.id,
    value: p.id
  }, p.name)))), /*#__PURE__*/React.createElement("button", {
    onClick: generate,
    className: "w-full py-3 bg-sky-600 text-white rounded-xl font-bold text-sm hover:bg-sky-700"
  }, "Generate Report")), preview && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm font-bold text-gray-700"
  }, "Preview (", preview.rows.length, " rows)"), /*#__PURE__*/React.createElement("button", {
    onClick: () => downloadCSV(toCSV(preview.headers, preview.rows), preview.filename),
    className: "flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700"
  }, "\u2B07\uFE0F Export to CSV")), preview.rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "text-center py-8 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100"
  }, "No data found for this date range.") : /*#__PURE__*/React.createElement("div", {
    className: "overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full text-xs"
  }, /*#__PURE__*/React.createElement("thead", {
    className: "bg-gray-50 border-b border-gray-100"
  }, /*#__PURE__*/React.createElement("tr", null, preview.headers.map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    className: "text-left px-3 py-2.5 font-bold text-gray-500 uppercase tracking-wide whitespace-nowrap"
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, preview.rows.slice(0, 20).map((row, i) => /*#__PURE__*/React.createElement("tr", {
    key: i,
    className: `border-b border-gray-50 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`
  }, row.map((cell, j) => /*#__PURE__*/React.createElement("td", {
    key: j,
    className: "px-3 py-2 text-gray-700 whitespace-nowrap max-w-[140px] truncate"
  }, cell)))))), preview.rows.length > 20 && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-2 text-xs text-gray-400"
  }, "Showing first 20 of ", preview.rows.length, " rows \u2014 export CSV to see all"))));
}
function SettingsTab({
  holidays,
  onAddHoliday,
  onRemoveHoliday
}) {
  const [form, setForm] = useState({
    name: '',
    date: '',
    scope: 'all',
    schoolName: ''
  });
  const [err, setErr] = useState('');
  const submit = () => {
    if (!form.name.trim() || !form.date) {
      setErr('Please enter a name and date.');
      return;
    }
    setErr('');
    onAddHoliday({
      id: genId(),
      ...form
    });
    setForm({
      name: '',
      date: '',
      scope: 'all',
      schoolName: ''
    });
  };
  const grouped = holidays.reduce((acc, h) => {
    const y = h.date.split('-')[0];
    acc[y] = acc[y] || [];
    acc[y].push(h);
    return acc;
  }, {});
  return /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-2xl shadow-sm border border-gray-100 p-4 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-sm font-bold text-gray-700"
  }, "\u2795 Add School Holiday or Inset Day"), /*#__PURE__*/React.createElement(Field, {
    label: "Name"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: form.name,
    onChange: e => setForm(v => ({
      ...v,
      name: e.target.value
    })),
    placeholder: "e.g. Christmas Holiday, Inset Day"
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Date"
  }, /*#__PURE__*/React.createElement("input", {
    type: "date",
    className: inp,
    value: form.date,
    onChange: e => setForm(v => ({
      ...v,
      date: e.target.value
    }))
  })), /*#__PURE__*/React.createElement(Field, {
    label: "Applies to"
  }, /*#__PURE__*/React.createElement("select", {
    className: inp,
    value: form.scope,
    onChange: e => setForm(v => ({
      ...v,
      scope: e.target.value
    }))
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All passengers"), /*#__PURE__*/React.createElement("option", {
    value: "school"
  }, "Specific school only"))), form.scope === 'school' && /*#__PURE__*/React.createElement(Field, {
    label: "School Name",
    hint: "Must match the drop-off address in the schedule"
  }, /*#__PURE__*/React.createElement("input", {
    className: inp,
    value: form.schoolName,
    onChange: e => setForm(v => ({
      ...v,
      schoolName: e.target.value
    })),
    placeholder: "e.g. Highfield Special School"
  })), err && /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-red-500"
  }, err), /*#__PURE__*/React.createElement("button", {
    onClick: submit,
    className: "w-full py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold"
  }, "Add Holiday / Inset Day")), Object.keys(grouped).sort().reverse().map(yr => /*#__PURE__*/React.createElement("div", {
    key: yr
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold text-gray-400 uppercase px-1 mb-2"
  }, yr), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, grouped[yr].sort((a, b) => a.date.localeCompare(b.date)).map(h => /*#__PURE__*/React.createElement("div", {
    key: h.id,
    className: "bg-white rounded-2xl border border-gray-100 p-3 flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "font-semibold text-gray-800 text-sm"
  }, h.name), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-gray-500"
  }, prettyDate(h.date), " \xB7 ", h.scope === 'all' ? 'All passengers' : `${h.schoolName} only`)), /*#__PURE__*/React.createElement("button", {
    onClick: () => onRemoveHoliday(h.id),
    className: "text-xs text-red-400 hover:text-red-600"
  }, "Remove")))))), !holidays.length && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-8 text-gray-400 text-sm"
  }, "No holidays or inset days added yet."), /*#__PURE__*/React.createElement("div", {
    className: "border-t border-gray-100 pt-4 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-xs font-bold text-gray-400 uppercase tracking-widest px-1"
  }, "Coming Soon"), /*#__PURE__*/React.createElement("div", {
    className: "bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-100 rounded-2xl p-4 space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-3xl"
  }, "\uD83C\uDFDB\uFE0F"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "font-bold text-indigo-800"
  }, "Council Portal"), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-indigo-600 mt-0.5"
  }, "Phase 2 Feature"))), /*#__PURE__*/React.createElement("p", {
    className: "text-sm text-indigo-700"
  }, "Council transport coordinators will be able to securely log in and view only their passengers' schedules. They can send notes directly to the manager \u2014 such as absences or changes \u2014 without being able to edit any schedules."), /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, ['🔐 Secure email & password login for council staff', '👁️ Read-only access to their passengers only', '📝 Send notes & absence notifications to manager', '📬 Manager receives instant notifications', '📋 Full communication history per passenger', '📊 Exportable communications report'].map(f => /*#__PURE__*/React.createElement("div", {
    key: f,
    className: "flex items-center gap-2 text-xs text-indigo-700"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-indigo-400"
  }, "\u2713"), f))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white/60 rounded-xl p-3 text-xs text-indigo-600 font-medium"
  }, "\u2699\uFE0F Requires Supabase setup \u2014 available as part of Phase 2 upgrade"))));
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
function App() {
  const [session, setSession] = useState(null);
  const [tab, setTab] = useState('runs');
  const [date, setDate] = useState(today());
  const [drivers, setDrivers] = useState([]);
  const [assistants, setAssistants] = useState([]);
  const [passengers, setPassengers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [oneoffs, setOneoffs] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('table');
  const [staffSub, setStaffSub] = useState('drivers');
  const [editItem, setEditItem] = useState(null);
  const [editMode, setEditMode] = useState(null);
  const [chargeItem, setChargeItem] = useState(null);
  const [reinstateItem, setReinstateItem] = useState(null);
  const [staffModal, setStaffModal] = useState(null);
  const [passengerModal, setPassengerModal] = useState(null);
  const [jobModal, setJobModal] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    (async () => {
      const d = await ld('sr8_d', null),
        a = await ld('sr8_a', null),
        p = await ld('sr8_p', null);
      const s = await ld('sr8_s', null),
        o = await ld('sr8_o', []),
        j = await ld('sr8_j', []),
        h = await ld('sr8_h', []);
      // Merge stored drivers with sample PINs in case PIN was missing from older saved data
      const loadedDrivers = d ? d.map(dr => {
        if (!dr.pin) {
          const sample = D0.find(x => x.id === dr.id);
          return sample ? {
            ...dr,
            pin: sample.pin
          } : dr;
        }
        return dr;
      }) : D0;
      setDrivers(loadedDrivers);
      setAssistants(a || A0);
      setPassengers(p || P0);
      setSchedules(s || SC0);
      setOneoffs(o);
      setJobs(j);
      setHolidays(h);
      if (!d) sv('sr8_d', D0);
      if (!a) sv('sr8_a', A0);
      if (!p) sv('sr8_p', P0);
      if (!s) sv('sr8_s', SC0);
      setLoading(false);
    })();
  }, []);
  const upD = v => {
    setDrivers(v);
    sv('sr8_d', v);
  };
  const upA = v => {
    setAssistants(v);
    sv('sr8_a', v);
  };
  const upP = v => {
    setPassengers(v);
    sv('sr8_p', v);
  };
  const upS = v => {
    setSchedules(v);
    sv('sr8_s', v);
  };
  const upO = v => {
    setOneoffs(v);
    sv('sr8_o', v);
  };
  const upJ = v => {
    setJobs(v);
    sv('sr8_j', v);
  };
  const upH = v => {
    setHolidays(v);
    sv('sr8_h', v);
  };
  const allRuns = useMemo(() => computeRuns(schedules, oneoffs, jobs, date, holidays).sort((a, b) => a.time.localeCompare(b.time)), [schedules, oneoffs, jobs, date, holidays]);
  const stats = {
    total: allRuns.filter(r => r.status !== 'holiday').length,
    unassigned: allRuns.filter(x => x.status === 'unassigned').length,
    scheduled: allRuns.filter(x => x.status === 'scheduled').length,
    cancelled: allRuns.filter(x => x.status === 'cancelled').length
  };
  const pendingCharge = allRuns.filter(r => r.status === 'cancelled' && !r.chargeStatus).length;
  const allStaff = [...drivers, ...assistants];
  const openEdit = item => {
    setEditItem(item);
    setEditMode('choice');
  };
  const openEditSchedule = item => {
    setPassengerModal({
      existing: passengers.find(x => x.id === item.passengerId)
    });
    setEditItem(null);
    setEditMode(null);
  };
  const handleSaveTodayRun = (run, ch) => {
    if (run.isRecurring) {
      const isP = run.type === 'pickup';
      const patch = isP ? {
        pickupTime: ch.time,
        pickupDriver: {
          id: ch.driverId,
          name: ch.driverName
        },
        pickupAsst: {
          id: ch.assistantId,
          name: ch.assistantName
        },
        pickupAddress: ch.pickup,
        pickupDropoff: ch.dropoff
      } : {
        returnTime: ch.time,
        returnDriver: {
          id: ch.driverId,
          name: ch.driverName
        },
        returnAsst: {
          id: ch.assistantId,
          name: ch.assistantName
        },
        returnAddress: ch.pickup,
        returnDropoff: ch.dropoff
      };
      upS(schedules.map(s => s.id !== run.scheduleId ? s : {
        ...s,
        overrides: {
          ...(s.overrides || {}),
          [run.date]: {
            ...(s.overrides?.[run.date] || {}),
            ...patch
          }
        }
      }));
    } else upO(oneoffs.map(r => r.id !== run.id ? r : {
      ...r,
      ...ch,
      status: ch.driverId ? 'scheduled' : 'unassigned'
    }));
  };
  const handleCancelTodayRun = run => {
    if (run.isRecurring) {
      const patch = run.type === 'pickup' ? {
        pickupCancelled: true
      } : {
        returnCancelled: true
      };
      upS(schedules.map(s => s.id !== run.scheduleId ? s : {
        ...s,
        overrides: {
          ...(s.overrides || {}),
          [run.date]: {
            ...(s.overrides?.[run.date] || {}),
            ...patch
          }
        }
      }));
    } else upO(oneoffs.map(r => r.id !== run.id ? r : {
      ...r,
      status: 'cancelled'
    }));
  };
  const handleDriverCancel = (run, note, cancelReturn) => {
    const ts = new Date().toISOString();
    if (run.isRecurring) {
      const isP = run.type === 'pickup';
      const patch = isP ? {
        pickupCancelled: true,
        cancelNote: note,
        cancelledAt: ts,
        ...(cancelReturn ? {
          returnCancelled: true,
          returnCancelNote: note,
          returnCancelledAt: ts
        } : {})
      } : {
        returnCancelled: true,
        returnCancelNote: note,
        returnCancelledAt: ts
      };
      upS(schedules.map(s => s.id !== run.scheduleId ? s : {
        ...s,
        overrides: {
          ...(s.overrides || {}),
          [run.date]: {
            ...(s.overrides?.[run.date] || {}),
            ...patch
          }
        }
      }));
    } else upO(oneoffs.map(r => r.id !== run.id ? r : {
      ...r,
      status: 'cancelled',
      cancelNote: note,
      cancelledAt: ts
    }));
  };
  const handleUndo = run => {
    if (run.isRecurring) {
      const isP = run.type === 'pickup';
      const key = isP ? 'pickupCancelled' : 'returnCancelled';
      upS(schedules.map(s => s.id !== run.scheduleId ? s : {
        ...s,
        overrides: {
          ...(s.overrides || {}),
          [run.date]: {
            ...(s.overrides?.[run.date] || {}),
            [key]: false,
            cancelNote: '',
            cancelledAt: null,
            chargeStatus: ''
          }
        }
      }));
    } else upO(oneoffs.map(r => r.id !== run.id ? r : {
      ...r,
      status: r.driverId ? 'scheduled' : 'unassigned',
      cancelNote: '',
      cancelledAt: null,
      chargeStatus: ''
    }));
  };
  const handleReinstate = (run, ch) => {
    if (run.isRecurring) {
      const isP = run.type === 'pickup';
      const patch = isP ? {
        pickupCancelled: false,
        cancelNote: '',
        cancelledAt: null,
        chargeStatus: '',
        pickupDriver: {
          id: ch.driverId,
          name: ch.driverName
        },
        pickupAsst: {
          id: ch.assistantId,
          name: ch.assistantName
        }
      } : {
        returnCancelled: false,
        returnCancelNote: '',
        returnCancelledAt: null,
        returnChargeStatus: '',
        returnDriver: {
          id: ch.driverId,
          name: ch.driverName
        },
        returnAsst: {
          id: ch.assistantId,
          name: ch.assistantName
        }
      };
      upS(schedules.map(s => s.id !== run.scheduleId ? s : {
        ...s,
        overrides: {
          ...(s.overrides || {}),
          [run.date]: {
            ...(s.overrides?.[run.date] || {}),
            ...patch
          }
        }
      }));
    } else upO(oneoffs.map(r => r.id !== run.id ? r : {
      ...r,
      status: ch.driverId ? 'scheduled' : 'unassigned',
      cancelNote: '',
      cancelledAt: null,
      chargeStatus: '',
      ...ch
    }));
    setReinstateItem(null);
  };
  const handleSetCharge = (run, chargeStatus) => {
    if (run.isRecurring) {
      const key = run.type === 'pickup' ? 'chargeStatus' : 'returnChargeStatus';
      upS(schedules.map(s => s.id !== run.scheduleId ? s : {
        ...s,
        overrides: {
          ...(s.overrides || {}),
          [run.date]: {
            ...(s.overrides?.[run.date] || {}),
            [key]: chargeStatus
          }
        }
      }));
    } else upO(oneoffs.map(r => r.id !== run.id ? r : {
      ...r,
      chargeStatus
    }));
    setChargeItem(null);
  };
  const savePassenger = (passenger, newScheds) => {
    upP(passengerModal?.existing ? passengers.map(x => x.id === passenger.id ? passenger : x) : [...passengers, passenger]);
    const oldScheds = schedules.filter(s => s.passengerId !== passenger.id);
    upS([...oldScheds, ...newScheds]);
    setPassengerModal(null);
  };
  const saveStaff = person => {
    const isAsst = staffModal.type === 'assistant';
    if (isAsst) upA(staffModal.existing ? assistants.map(x => x.id === person.id ? person : x) : [...assistants, person]);else upD(staffModal.existing ? drivers.map(x => x.id === person.id ? person : x) : [...drivers, person]);
    setStaffModal(null);
  };
  const saveJob = job => {
    upJ(jobModal?.existing ? jobs.map(x => x.id === job.id ? job : x) : [...jobs, job]);
    setJobModal(null);
  };
  const archivePassenger = id => {
    upP(passengers.map(p => p.id === id ? {
      ...p,
      archived: true
    } : p));
    upS(schedules.map(s => s.passengerId === id ? {
      ...s,
      archived: true
    } : s));
  };
  const updateDriverProfile = (driverId, profile) => {
    upD(drivers.map(d => d.id === driverId ? {
      ...d,
      ...profile
    } : d));
    if (session?.role === 'driver' && session?.driver?.id === driverId) {
      setSession(s => ({
        ...s,
        driver: {
          ...s.driver,
          ...profile
        }
      }));
    }
  };
  if (loading) return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-slate-50 flex items-center justify-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-gray-400 text-sm"
  }, "Loading Pembrokeshire Taxis\u2026"));
  if (!session) return /*#__PURE__*/React.createElement(PinLogin, {
    drivers: drivers,
    onStaffLogin: d => setSession({
      role: 'driver',
      driver: d
    }),
    onManagerLogin: () => setSession({
      role: 'manager'
    })
  });
  if (session.role === 'driver') return /*#__PURE__*/React.createElement(DriverView, {
    driver: session.driver,
    schedules: schedules,
    oneoffs: oneoffs,
    jobs: jobs,
    holidays: holidays,
    onCancel: handleDriverCancel,
    onUndo: handleUndo,
    onLogout: () => setSession(null),
    onUpdateProfile: updateDriverProfile
  });
  const activePassengers = passengers.filter(p => !p.archived);
  const archivedPassengers = passengers.filter(p => p.archived);
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen bg-slate-50 relative overflow-hidden",
    style: {
      fontFamily: "'DM Sans',system-ui,sans-serif"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 flex items-center justify-center pointer-events-none select-none z-0",
    style: {
      opacity: 0.04
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-center",
    style: {
      transform: 'rotate(-25deg)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-8xl"
  }, "\uD83D\uDE90"), /*#__PURE__*/React.createElement("div", {
    className: "text-6xl font-black text-gray-900 whitespace-nowrap mt-2"
  }, "Pembrokeshire"), /*#__PURE__*/React.createElement("div", {
    className: "text-6xl font-black text-gray-900 whitespace-nowrap"
  }, "Taxis"))), /*#__PURE__*/React.createElement("div", {
    className: "relative z-10 bg-gradient-to-r from-sky-700 to-indigo-700 text-white px-4 pt-5 pb-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-3xl mx-auto flex items-center justify-between mb-3"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "font-black text-xl"
  }, "\uD83D\uDE90 Pembrokeshire Taxis"), /*#__PURE__*/React.createElement("div", {
    className: "text-sky-200 text-xs mt-0.5"
  }, "Manager")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSession(null),
    className: "text-xs bg-white/20 px-3 py-1.5 rounded-full hover:bg-white/30"
  }, "Log out")), /*#__PURE__*/React.createElement("div", {
    className: "max-w-3xl mx-auto"
  }, /*#__PURE__*/React.createElement(DateNav, {
    date: date,
    onChange: setDate
  })), /*#__PURE__*/React.createElement("div", {
    className: "max-w-3xl mx-auto mt-3 grid grid-cols-4 gap-2"
  }, [{
    l: 'Total',
    v: stats.total,
    c: 'text-white'
  }, {
    l: 'Unassigned',
    v: stats.unassigned,
    c: 'text-amber-300'
  }, {
    l: 'Scheduled',
    v: stats.scheduled,
    c: 'text-sky-200'
  }, {
    l: 'Cancelled',
    v: stats.cancelled,
    c: 'text-red-300'
  }].map(s => /*#__PURE__*/React.createElement("div", {
    key: s.l,
    className: "bg-white/10 rounded-xl py-2 text-center"
  }, /*#__PURE__*/React.createElement("div", {
    className: `text-2xl font-black ${s.c}`
  }, s.v), /*#__PURE__*/React.createElement("div", {
    className: "text-white/60 text-xs"
  }, s.l)))), pendingCharge > 0 && /*#__PURE__*/React.createElement("div", {
    className: "max-w-3xl mx-auto mt-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-orange-400/30 border border-orange-300/40 rounded-xl px-3 py-2 text-xs text-orange-100 font-semibold"
  }, "\u26A0\uFE0F ", pendingCharge, " cancellation", pendingCharge > 1 ? 's' : '', " need a charge status set"))), /*#__PURE__*/React.createElement("div", {
    className: "bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm"
  }, /*#__PURE__*/React.createElement("div", {
    className: "max-w-3xl mx-auto flex"
  }, [{
    id: 'runs',
    l: '📋 Runs'
  }, {
    id: 'jobs',
    l: '✈️ Jobs'
  }, {
    id: 'staff',
    l: '👥 Staff'
  }, {
    id: 'passengers',
    l: '🎒 Passengers'
  }, {
    id: 'settings',
    l: '⚙️ Settings'
  }, {
    id: 'reports',
    l: '📊 Reports'
  }].map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setTab(t.id),
    className: `flex-1 py-3 text-xs font-bold transition-colors ${tab === t.id ? 'border-b-2 border-sky-600 text-sky-700' : 'text-gray-400 hover:text-gray-600'}`
  }, t.l)))), /*#__PURE__*/React.createElement("div", {
    className: "max-w-3xl mx-auto px-4 py-4 pb-20"
  }, tab === 'runs' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-2"
  }, [{
    id: 'table',
    icon: '⊞',
    label: 'Table View',
    desc: 'See all runs in a structured list'
  }, {
    id: 'cards',
    icon: '☰',
    label: 'Cards View',
    desc: 'Browse runs as individual cards'
  }, {
    id: 'bydriver',
    icon: '👤',
    label: 'Staff Schedule',
    desc: 'See runs grouped by driver or assistant'
  }].map(v => /*#__PURE__*/React.createElement("button", {
    key: v.id,
    onClick: () => setViewMode(v.id),
    className: `w-full flex items-center gap-4 px-4 py-3 rounded-2xl border-2 text-left transition-all ${viewMode === v.id ? 'border-sky-500 bg-sky-50' : 'border-gray-200 bg-white hover:border-sky-200 hover:bg-gray-50'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-2xl"
  }, v.icon), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: `font-bold text-sm ${viewMode === v.id ? 'text-sky-700' : 'text-gray-700'}`
  }, v.label), /*#__PURE__*/React.createElement("div", {
    className: `text-xs mt-0.5 ${viewMode === v.id ? 'text-sky-500' : 'text-gray-400'}`
  }, v.desc)), viewMode === v.id && /*#__PURE__*/React.createElement("span", {
    className: "ml-auto text-sky-500 text-lg"
  }, "\u2713")))), viewMode === 'table' && /*#__PURE__*/React.createElement(TableView, {
    items: allRuns,
    onEdit: openEdit,
    onCharge: setChargeItem,
    onReinstate: setReinstateItem,
    schedules: schedules,
    now: now
  }), viewMode === 'cards' && /*#__PURE__*/React.createElement(CardsView, {
    items: allRuns,
    onEdit: openEdit,
    onCharge: setChargeItem,
    onReinstate: setReinstateItem,
    now: now
  }), viewMode === 'bydriver' && /*#__PURE__*/React.createElement(ByDriverView, {
    items: allRuns,
    drivers: drivers,
    assistants: assistants,
    onEdit: openEdit,
    onCharge: setChargeItem,
    onReinstate: setReinstateItem
  })), tab === 'jobs' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setJobModal({}),
    className: "w-full py-3 bg-orange-500 text-white rounded-2xl font-bold"
  }, "+ Add One-off Job"), jobs.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-12 text-gray-400"
  }, /*#__PURE__*/React.createElement("div", {
    className: "text-4xl mb-2"
  }, "\u2708\uFE0F"), /*#__PURE__*/React.createElement("div", null, "No one-off jobs yet.")), jobs.sort((a, b) => a.date.localeCompare(b.date)).map(j => /*#__PURE__*/React.createElement("div", {
    key: j.id,
    className: "bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 border-l-orange-400 p-4 space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-bold text-sky-700"
  }, fmt(j.time)), /*#__PURE__*/React.createElement("span", {
    className: "text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold"
  }, "\u2708\uFE0F One-off Job")), /*#__PURE__*/React.createElement(Badge, {
    s: j.status
  })), /*#__PURE__*/React.createElement("div", {
    className: "font-semibold text-gray-800"
  }, j.customerName), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-gray-500"
  }, prettyDate(j.date)), /*#__PURE__*/React.createElement("div", {
    className: "text-sm text-gray-600 space-y-0.5"
  }, /*#__PURE__*/React.createElement("div", null, "\uD83C\uDFE0 ", j.pickup), /*#__PURE__*/React.createElement("div", null, "\uD83D\uDCCD ", j.dropoff), /*#__PURE__*/React.createElement("div", null, "\uD83D\uDC64 ", j.driverName || 'No driver'), j.assistantName && /*#__PURE__*/React.createElement("div", null, "\uD83E\uDD1D ", j.assistantName)), j.notes && /*#__PURE__*/React.createElement("div", {
    className: "text-xs bg-amber-50 text-amber-700 rounded-xl p-2"
  }, "\uD83D\uDCDD ", j.notes), /*#__PURE__*/React.createElement("button", {
    onClick: () => setJobModal({
      existing: j
    }),
    className: "text-xs text-sky-600 font-semibold"
  }, "Edit")))), tab === 'staff' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "bg-white rounded-xl border border-gray-200 p-0.5 flex gap-0.5 w-fit"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setStaffSub('drivers'),
    className: `px-4 py-1.5 rounded-lg text-xs font-bold ${staffSub === 'drivers' ? 'bg-sky-600 text-white' : 'text-gray-500'}`
  }, "\uD83D\uDC64 Drivers (", drivers.length, ")"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setStaffSub('assistants'),
    className: `px-4 py-1.5 rounded-lg text-xs font-bold ${staffSub === 'assistants' ? 'bg-sky-600 text-white' : 'text-gray-500'}`
  }, "\uD83E\uDD1D Assistants (", assistants.length, ")")), staffSub === 'drivers' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setStaffModal({
      type: 'driver'
    }),
    className: "w-full py-3 bg-sky-600 text-white rounded-2xl font-bold"
  }, "+ Add Driver"), drivers.map(d => /*#__PURE__*/React.createElement("div", {
    key: d.id,
    className: `bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 p-4 ${d.avail ? 'border-l-emerald-400' : 'border-l-gray-200'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-0.5 flex-1 pr-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-bold text-gray-800"
  }, d.name), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-gray-500"
  }, "\uD83C\uDFE0 ", [d.address, d.town, d.postcode].filter(Boolean).join(', ')), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-gray-500"
  }, "\uD83D\uDCDE ", d.phone), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 mt-1"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"
  }, "PIN: ", '•'.repeat(6)))), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-2 items-end shrink-0"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => upD(drivers.map(x => x.id === d.id ? {
      ...x,
      avail: !x.avail
    } : x)),
    className: `text-xs px-3 py-1.5 rounded-full font-bold ${d.avail ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`
  }, d.avail ? '✓ Available' : '✗ Off'), /*#__PURE__*/React.createElement("button", {
    onClick: () => setStaffModal({
      type: 'driver',
      existing: d
    }),
    className: "text-xs text-gray-400 hover:text-sky-600"
  }, "Edit / Reset PIN"), /*#__PURE__*/React.createElement("button", {
    className: "text-xs text-gray-400 hover:text-indigo-600",
    onClick: () => alert('Document storage coming soon!')
  }, "\uD83D\uDCC4 Documents")))))), staffSub === 'assistants' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setStaffModal({
      type: 'assistant'
    }),
    className: "w-full py-3 bg-sky-600 text-white rounded-2xl font-bold"
  }, "+ Add Assistant"), assistants.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.id,
    className: `bg-white rounded-2xl shadow-sm border border-gray-100 border-l-4 p-4 ${a.avail ? 'border-l-emerald-400' : 'border-l-gray-200'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-0.5 flex-1 pr-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-bold text-gray-800"
  }, a.name), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-gray-500"
  }, "\uD83C\uDFE0 ", [a.address, a.town, a.postcode].filter(Boolean).join(', ')), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-gray-500"
  }, "\uD83D\uDCDE ", a.phone)), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-2 items-end shrink-0"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => upA(assistants.map(x => x.id === a.id ? {
      ...x,
      avail: !x.avail
    } : x)),
    className: `text-xs px-3 py-1.5 rounded-full font-bold ${a.avail ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`
  }, a.avail ? '✓ Available' : '✗ Off'), /*#__PURE__*/React.createElement("button", {
    onClick: () => setStaffModal({
      type: 'assistant',
      existing: a
    }),
    className: "text-xs text-gray-400 hover:text-sky-600"
  }, "Edit"), /*#__PURE__*/React.createElement("button", {
    className: "text-xs text-gray-400 hover:text-indigo-600",
    onClick: () => alert('Document storage coming soon!')
  }, "\uD83D\uDCC4 Documents"))))))), tab === 'passengers' && /*#__PURE__*/React.createElement("div", {
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setPassengerModal({}),
    className: "w-full py-3 bg-sky-600 text-white rounded-2xl font-bold"
  }, "+ Add Passenger"), activePassengers.map(p => {
    const pScheds = schedules.filter(s => s.passengerId === p.id && !s.archived);
    return /*#__PURE__*/React.createElement("div", {
      key: p.id,
      className: "bg-white rounded-2xl shadow-sm border border-gray-100 p-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-start"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex-1 pr-3 space-y-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "font-bold text-gray-800 text-base"
    }, p.name, p.wheelchair && /*#__PURE__*/React.createElement("span", {
      className: "ml-1 text-violet-500"
    }, "\u267F")), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-gray-500"
    }, "\uD83C\uDFE0 ", [p.address, p.town, p.postcode].filter(Boolean).join(', ') || 'No address'), pScheds.map(sch => /*#__PURE__*/React.createElement("div", {
      key: sch.id,
      className: "border border-gray-100 rounded-xl overflow-hidden"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-gray-50 px-3 py-1.5 text-xs font-bold text-gray-500 flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", null, sch.label || 'Schedule'), /*#__PURE__*/React.createElement("span", {
      className: "text-gray-300"
    }, "\xB7"), /*#__PURE__*/React.createElement("span", null, DAYS.filter(d => sch.days.includes(d.js)).map(d => d.f).join(', '))), /*#__PURE__*/React.createElement("div", {
      className: "p-2 space-y-1.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-green-50 rounded-lg p-2 space-y-0.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-xs font-bold text-green-700"
    }, "\uD83C\uDFE0 Pickup \u2014 ", fmt(sch.pickup.time)), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-gray-500 truncate"
    }, sch.pickup.pickup), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-gray-600"
    }, "\uD83D\uDC64 ", sch.pickup.driverName || /*#__PURE__*/React.createElement("span", {
      className: "text-amber-500"
    }, "No driver"), " \xB7 \uD83E\uDD1D ", sch.pickup.assistantName || 'None')), sch.hasReturn && /*#__PURE__*/React.createElement("div", {
      className: "bg-blue-50 rounded-lg p-2 space-y-0.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-xs font-bold text-blue-700"
    }, "\u21A9 Return \u2014 ", fmt(sch.return.time)), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-gray-500 truncate"
    }, sch.return.pickup), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-gray-600"
    }, "\uD83D\uDC64 ", sch.return.driverName || /*#__PURE__*/React.createElement("span", {
      className: "text-amber-500"
    }, "No driver"), " \xB7 \uD83E\uDD1D ", sch.return.assistantName || 'None'))))), p.notes && /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-amber-600 bg-amber-50 rounded-xl p-2"
    }, "\uD83D\uDCDD ", p.notes), /*#__PURE__*/React.createElement("div", {
      className: "bg-indigo-50 border border-indigo-100 rounded-xl p-2.5 space-y-1"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-xs font-bold text-indigo-700"
    }, "\uD83C\uDFDB\uFE0F Council Communications"), /*#__PURE__*/React.createElement("div", {
      className: "text-xs text-indigo-500"
    }, "No messages yet \u2014 council portal coming in Phase 2"))), /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col gap-2 items-end shrink-0"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => setPassengerModal({
        existing: p
      }),
      className: "text-xs text-gray-400 hover:text-sky-600"
    }, "Edit"), /*#__PURE__*/React.createElement("button", {
      onClick: () => archivePassenger(p.id),
      className: "text-xs text-red-400 hover:text-red-600"
    }, "Archive"))));
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => setShowArchived(!showArchived),
    className: "w-full py-2.5 border border-gray-200 rounded-2xl text-sm text-gray-500 font-semibold"
  }, showArchived ? '▲ Hide' : '▼ View', " Archived Passengers (", archivedPassengers.length, ")"), showArchived && archivedPassengers.map(p => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    className: "bg-gray-50 rounded-2xl border border-gray-200 p-4 opacity-70"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-1 pr-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "font-bold text-gray-600"
  }, p.name, p.wheelchair && /*#__PURE__*/React.createElement("span", {
    className: "ml-1 text-violet-400"
  }, "\u267F")), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-gray-400"
  }, "\uD83C\uDFE0 ", [p.address, p.town, p.postcode].filter(Boolean).join(', ') || 'No address'), /*#__PURE__*/React.createElement("div", {
    className: "text-xs text-gray-400 mt-1"
  }, "Archived passenger")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setPassengerModal({
      existing: p,
      reinstating: true
    }),
    className: "text-xs bg-sky-100 text-sky-700 px-3 py-1.5 rounded-full font-bold hover:bg-sky-200"
  }, "\u21A9 Reinstate"))))), tab === 'settings' && /*#__PURE__*/React.createElement(SettingsTab, {
    holidays: holidays,
    onAddHoliday: h => upH([...holidays, h]),
    onRemoveHoliday: id => upH(holidays.filter(h => h.id !== id))
  }), tab === 'reports' && /*#__PURE__*/React.createElement(ReportsTab, {
    schedules: schedules,
    oneoffs: oneoffs,
    jobs: jobs,
    drivers: drivers,
    assistants: assistants,
    passengers: passengers
  })), editItem && editMode === 'choice' && /*#__PURE__*/React.createElement(EditChoiceModal, {
    run: editItem,
    onEditToday: () => setEditMode('today'),
    onEditSchedule: () => openEditSchedule(editItem),
    onClose: () => {
      setEditItem(null);
      setEditMode(null);
    }
  }), editItem && editMode === 'today' && /*#__PURE__*/React.createElement(EditTodayModal, {
    run: editItem,
    drivers: drivers,
    allStaff: allStaff,
    allRuns: allRuns,
    onSave: handleSaveTodayRun,
    onCancel: handleCancelTodayRun,
    onClose: () => {
      setEditItem(null);
      setEditMode(null);
    }
  }), chargeItem && /*#__PURE__*/React.createElement(ChargeModal, {
    run: chargeItem,
    onSave: cs => handleSetCharge(chargeItem, cs),
    onClose: () => setChargeItem(null)
  }), reinstateItem && /*#__PURE__*/React.createElement(ReinstateModal, {
    run: reinstateItem,
    drivers: drivers,
    allStaff: allStaff,
    onSave: (run, ch) => handleReinstate(run, ch),
    onClose: () => setReinstateItem(null)
  }), staffModal && /*#__PURE__*/React.createElement(StaffForm, {
    existing: staffModal.existing,
    isAsst: staffModal.type === 'assistant',
    allDrivers: drivers,
    onSave: saveStaff,
    onClose: () => setStaffModal(null)
  }), passengerModal != null && /*#__PURE__*/React.createElement(Modal, {
    title: passengerModal.existing ? passengerModal.reinstating ? `Reinstate — ${passengerModal.existing.name}` : `Edit — ${passengerModal.existing.name}` : 'Add New Passenger',
    onClose: () => setPassengerModal(null),
    size: "lg"
  }, /*#__PURE__*/React.createElement(PassengerForm, {
    existing: passengerModal.existing,
    existingScheds: passengerModal.existing ? schedules.filter(s => s.passengerId === passengerModal.existing.id) : [],
    drivers: drivers,
    assistants: assistants,
    onSave: (p, s) => {
      if (passengerModal.reinstating) {
        upP(passengers.map(x => x.id === p.id ? {
          ...p,
          archived: false
        } : x));
        upS([...schedules.filter(sc => sc.passengerId !== p.id), ...s.map(sc => ({
          ...sc,
          archived: false
        }))]);
        setPassengerModal(null);
      } else savePassenger(p, s);
    },
    onClose: () => setPassengerModal(null)
  })), jobModal != null && /*#__PURE__*/React.createElement(Modal, {
    title: jobModal.existing ? 'Edit Job' : 'Add One-off Job',
    onClose: () => setJobModal(null)
  }, /*#__PURE__*/React.createElement(JobForm, {
    existing: jobModal.existing,
    drivers: drivers,
    allStaff: allStaff,
    onSave: saveJob,
    onClose: () => setJobModal(null)
  })));
}
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
