let guests = [];
let tables = [];
let selectedItem = null;

const CHAIR_SIZE = 20;
const CHAIR_GAP = 5;

let undoStack = [];
let tableClipboard = null;

function pushUndo(message = 'action') {
    undoStack.push({ state: serializeConfig(), message });
    if (undoStack.length > 20) undoStack.shift();
}

function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.add('hidden'), 2000);
}

function undoLast() {
    if (undoStack.length === 0) {
        showToast('Nothing to undo');
        return;
    }
    const { state, message } = undoStack.pop();
    loadConfig(state);
    showToast(`Undid: ${message}`);
}

function showModal(message, opts = {}) {
    return new Promise(resolve => {
        const backdrop = document.getElementById('modalBackdrop');
        const msgEl = document.getElementById('modalMessage');
        const btnBox = document.getElementById('modalButtons');
        const inputBox = document.getElementById('modalInputContainer');
        msgEl.textContent = message;
        btnBox.innerHTML = '';
        inputBox.innerHTML = '';
        let inputEl = null;
        if (opts.input) {
            inputEl = document.createElement('input');
            inputEl.value = opts.input.default || '';
            inputBox.appendChild(inputEl);
        }
        backdrop.classList.remove('hidden');
        (opts.buttons || []).forEach(b => {
            const btn = document.createElement('button');
            btn.textContent = b.label;
            btn.addEventListener('click', () => {
                backdrop.classList.add('hidden');
                resolve(b.value !== undefined ? b.value : (inputEl ? inputEl.value : true));
            });
            btnBox.appendChild(btn);
        });
    });
}

function alertModal(msg) {
    return showModal(msg, { buttons: [{ label: 'OK', value: true }] });
}

function confirmModal(msg) {
    return showModal(msg, {
        buttons: [
            { label: 'Yes', value: true },
            { label: 'No', value: false }
        ]
    });
}

function promptModal(msg, def) {
    return showModal(msg, {
        input: { default: def },
        buttons: [
            { label: 'OK' },
            { label: 'Cancel', value: null }
        ]
    });
}

function confirmHeads(multiple) {
    if (multiple) {
        return showModal('Use the heads of the table for seating?', {
            buttons: [
                { label: 'Yes to all', value: true },
                { label: 'No to all', value: false }
            ]
        });
    }
    return confirmModal('Use the heads of the table for seating?');
}

function selectItem(el) {
    if (selectedItem) selectedItem.classList.remove('selected');
    selectedItem = el;
    if (selectedItem) selectedItem.classList.add('selected');
    if (selectedItem && selectedItem.classList.contains('table')) {
        const tableObj = tables.find(t => t.element === selectedItem);
        showTableDetails(tableObj);
    } else {
        showUnseatedGuests();
    }
}

function showTableDetails(tableObj) {
    const panel = document.getElementById('tableDetails');
    if (!panel) return;
    panel.innerHTML = '';
    if (!tableObj) return;

    const controls = document.createElement('div');
    controls.className = 'table-controls';

    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Table Name';
    const nameInput = document.createElement('input');
    nameInput.value = tableObj.element.dataset.id;
    nameInput.addEventListener('input', () => {
        tableObj.element.dataset.id = nameInput.value.trim();
        tableObj.element.textContent = nameInput.value.trim();
    });
    nameLabel.appendChild(nameInput);
    controls.appendChild(nameLabel);

    const shapeLabel = document.createElement('label');
    shapeLabel.textContent = 'Shape';
    const shapeSelect = document.createElement('select');
    ['square','rectangular','round'].forEach(sh => {
        const opt = document.createElement('option');
        opt.value = sh;
        opt.textContent = sh;
        shapeSelect.appendChild(opt);
    });
    shapeSelect.value = tableObj.shape;
    shapeSelect.addEventListener('change', () => {
        tableObj.shape = shapeSelect.value;
        tableObj.element.classList.remove('square','rectangular','round');
        tableObj.element.classList.add(shapeSelect.value);
        const dims = getTableDimensions(tableObj.seats.length, tableObj.shape, tableObj);
        tableObj.element.style.width = dims.width + 'px';
        tableObj.element.style.height = dims.height + 'px';
        repositionChairs(tableObj.element);
        showTableDetails(tableObj);
    });
    shapeLabel.appendChild(shapeSelect);
    controls.appendChild(shapeLabel);

    if (tableObj.shape === 'rectangular') {
        const rotateBtn = document.createElement('button');
        rotateBtn.textContent = 'Rotate 90\u00B0';
        rotateBtn.addEventListener('click', () => {
            const el = tableObj.element;
            const w = el.style.width;
            el.style.width = el.style.height;
            el.style.height = w;
            repositionChairs(el);
        });
        controls.appendChild(rotateBtn);
    }

    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete Table';
    deleteBtn.classList.add('delete-button');
    deleteBtn.addEventListener('click', async () => {
        if (!await confirmModal('Delete this table?')) return;
        pushUndo('Delete table ' + (tableObj.element.dataset.id || ''));
        tableObj.seats.forEach(ch => ch.remove());
        const idx = tables.indexOf(tableObj);
        if (idx !== -1) tables.splice(idx, 1);
        tableObj.element.remove();
        selectItem(null);
    });
    controls.appendChild(deleteBtn);

    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Clear All Seats';
    clearBtn.addEventListener('click', async () => {
        if (!await confirmModal('Remove all guests from this table?')) return;
        tableObj.seats.forEach(ch => unassignGuest(ch));
    });
    controls.appendChild(clearBtn);

    panel.appendChild(controls);
    const groups = {};
    tableObj.seats.forEach(ch => {
        const guestId = ch.dataset.guest;
        if (!guestId) return;
        const guestInfo = guests.find(g => g.__id === guestId) || {};
        const name = guestInfo['Guest Name'] || ch.dataset.guestName || '';
        const party = ch.dataset.party || guestInfo['Party ID'] || 'No Party';
        if (!groups[party]) groups[party] = [];
        groups[party].push({
            name,
            responded: guestInfo['Responded'] || '',
            rsvp: guestInfo['RSVP Response'] || ''
        });
    });

    const tbl = document.createElement('table');
    const header = document.createElement('tr');
    ['Guest Name', 'Responded', 'RSVP Response'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        header.appendChild(th);
    });
    tbl.appendChild(header);

    Object.values(groups).forEach((group, idx, arr) => {
        group.forEach(g => {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = g.name;
            const respondedCell = document.createElement('td');
            respondedCell.textContent = g.responded;
            const rsvpCell = document.createElement('td');
            rsvpCell.textContent = g.rsvp;
            row.appendChild(nameCell);
            row.appendChild(respondedCell);
            row.appendChild(rsvpCell);
            tbl.appendChild(row);
        });
        if (idx < arr.length - 1) {
            const spacer = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 3;
            cell.style.borderBottom = '1px solid #ccc';
            spacer.appendChild(cell);
            tbl.appendChild(spacer);
        }
    });
    panel.appendChild(tbl);
}

function splitCSVLine(line) {
    const cells = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                cells.push(current);
                current = '';
            } else {
                current += ch;
            }
        }
    }
    cells.push(current);
    return cells;
}

function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const headers = splitCSVLine(lines.shift());
    return lines.map(line => {
        const cells = splitCSVLine(line);
        const obj = {};
        headers.forEach((h, i) => {
            obj[h.trim()] = cells[i] ? cells[i].trim() : '';
        });
        return obj;
    });
}

function loadCSV(text) {
    const rows = parseCSV(text);
    return rows.map((row, idx) => {
        const obj = { ...row };
        // Normalize commonly used headers from popular wedding sites
        obj['Party ID'] =
            obj['Party ID'] ||
            obj['Group'] ||
            obj['Group Name'] ||
            obj['Party Name'] ||
            obj['Household'] ||
            '';
        if (!obj['Guest Name']) {
            const first = obj['First Name'] || obj['First'] || '';
            const last = obj['Last Name'] || obj['Last'] || '';
            const combined = [first, last].filter(Boolean).join(' ');
            obj['Guest Name'] = obj['Name'] || combined;
        }
        obj['Responded'] =
            obj['Responded'] ||
            obj['Has RSVPed'] ||
            obj['RSVP Status'] ||
            '';
        obj['RSVP Response'] =
            obj['RSVP Response'] ||
            obj['RSVP'] ||
            obj['Response'] ||
            obj['Attendance'] ||
            obj['RSVP Status'] ||
            '';
        obj.__id = `g${idx}`;
        return obj;
    });
}

function loadGuestsFromFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        guests = loadCSV(e.target.result);
        guests.forEach((g, i) => { if (!g.__id) g.__id = `g${i}`; });
        document.getElementById('guestStatus').textContent = `Loaded ${guests.length} guests.`;
        updateGuestOptions();
        updateRoomStats();
    };
    reader.readAsText(file);
}

function handleGuestFile() {
    const fileInput = document.getElementById('guestFile');
    const file = fileInput.files[0];
    if (!file) return;
    loadGuestsFromFile(file);
}

document.getElementById('loadGuests').addEventListener('click', handleGuestFile);

function exportGuestList() {
    if (guests.length === 0) return;
    const headers = Object.keys(guests[0]).filter(h => h !== '__id');
    const data = guests.map(g => {
        const { __id, ...row } = g;
        let tableId = '';
        for (const table of tables) {
            if (table.seats.some(ch => ch.dataset.guest === g.__id)) {
                tableId = table.element.dataset.id || '';
                break;
            }
        }
        row['Table'] = tableId;
        return row;
    });

    const csvHeaders = headers.concat('Table');
    let csv = csvHeaders.join(',') + '\n';
    data.forEach(r => {
        csv += csvHeaders.map(h => {
            let val = r[h] || '';
            if (/[",\n]/.test(val)) {
                val = '"' + val.replace(/"/g, '""') + '"';
            }
            return val;
        }).join(',') + '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guestlist_with_tables.csv';
    a.click();
    URL.revokeObjectURL(url);
}

document.getElementById('exportGuests').addEventListener('click', exportGuestList);

document.getElementById('itemType').addEventListener('change', () => {
    const type = document.getElementById('itemType').value;
    const show = type === 'table';
    document.getElementById('tableShape').style.display = show ? '' : 'none';
    document.getElementById('seatCount').style.display = show ? '' : 'none';
    document.getElementById('itemCount').style.display = show ? '' : 'none';
});
document.getElementById('itemType').dispatchEvent(new Event('change'));

document.getElementById('addItem').addEventListener('click', async () => {
    pushUndo('Add item');
    const type = document.getElementById('itemType').value;
    if (type === 'table') {
        const shape = document.getElementById('tableShape').value;
        const seats = parseInt(document.getElementById('seatCount').value);
        const count = parseInt(document.getElementById('itemCount').value);
        let useHeads = false;
        let headSeats = 0;
        if (shape === 'rectangular') {
            useHeads = await confirmHeads(count > 1);
            if (useHeads) {
                const hs = await promptModal('How many chairs fit at each head?', '1');
                headSeats = parseInt(hs, 10);
                if (isNaN(headSeats)) headSeats = 0;
            }
        }
        for (let i=0; i<count; i++) createTable(seats, shape, { useHeads, headSeats });
    } else {
        createRect(type);
    }
    updateRoomStats();
});

function getTableDimensions(seats, shape, opts = {}) {
    let width, height;
    if (shape === 'round') {
        const circumference = seats * (CHAIR_SIZE + CHAIR_GAP);
        const diameter = circumference / Math.PI;
        const min = 50;
        width = height = Math.max(min, diameter - CHAIR_SIZE);
    } else if (shape === 'square') {
        const perSide = Math.ceil(seats / 4);
        const side = Math.max(50, perSide * (CHAIR_SIZE + CHAIR_GAP));
        width = height = side;
    } else {
        const headSeats = opts.useHeads ? opts.headSeats : 0;
        const longSeats = Math.max(0, seats - headSeats * 2);
        const perLong = Math.ceil(longSeats / 2);
        width = Math.max(80, perLong * (CHAIR_SIZE + CHAIR_GAP));
        height = Math.max(60, (headSeats > 0 ? headSeats : 1) * (CHAIR_SIZE + CHAIR_GAP));
    }
    return { width, height };
}

function createTable(seats, shape, opts = {}) {
    const ballroom = document.getElementById('ballroom');
    const tableId = tables.length + 1;
    const table = document.createElement('div');
    table.className = `table ${shape}`;
    const dims = getTableDimensions(seats, shape, opts);
    table.style.width = dims.width + 'px';
    table.style.height = dims.height + 'px';
    table.style.left = '10px';
    table.style.top = '10px';
    table.textContent = tableId;
    table.dataset.id = tableId;
    table.contentEditable = true;
    table.addEventListener('input', () => {
        table.dataset.id = table.textContent.trim();
    });
    ballroom.appendChild(table);
    table.addEventListener('click', e => { e.stopPropagation(); selectItem(table); });
    makeDraggable(table);
    const tableObj = { element: table, seats: [], partyColors: {}, shape };
    if (shape === 'rectangular') {
        const useHeads = opts.useHeads && opts.headSeats > 0;
        tableObj.useHeads = useHeads;
        tableObj.headSeats = useHeads ? opts.headSeats : 0;
    }
    tables.push(tableObj);
    createChairs(tableObj, seats);
    updateRoomStats();
}

function createRect(type, opts = {}) {
    const ballroom = document.getElementById('ballroom');
    const el = document.createElement('div');
    el.className = type;
    el.style.width = opts.width || '120px';
    el.style.height = opts.height || '80px';
    el.style.left = opts.left || '10px';
    el.style.top = opts.top || '10px';
    el.textContent = opts.text || type;
    el.classList.add('resizable');
    ballroom.appendChild(el);
    el.addEventListener('click', e => { e.stopPropagation(); selectItem(el); });
    makeDraggable(el);
    return el;
}

function createChairs(tableObj, count) {
    const ballroom = document.getElementById('ballroom');
    tableObj.seats = [];
    for (let i = 0; i < count; i++) {
        const chair = document.createElement('div');
        chair.className = 'chair';
        chair.dataset.guest = '';
        chair.addEventListener('click', () => assignGuest(chair));
        chair.addEventListener('contextmenu', e => {
            e.preventDefault();
            unassignGuest(chair);
        });
        chair.addEventListener('dragover', e => e.preventDefault());
        chair.addEventListener('drop', e => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            if (id) seatGuest(chair, id);
        });
        ballroom.appendChild(chair);
        tableObj.seats.push(chair);
    }
    repositionChairs(tableObj.element);
}

function makeDraggable(el) {
    const ballroom = document.getElementById('ballroom');
    let offsetX, offsetY, dragging = false;
    el.addEventListener('mousedown', e => {
        dragging = true;
        offsetX = e.offsetX;
        offsetY = e.offsetY;
    });
    document.addEventListener('mousemove', e => {
        if (!dragging) return;
        const rect = ballroom.getBoundingClientRect();
        let x = e.clientX - rect.left - offsetX;
        let y = e.clientY - rect.top - offsetY;
        x = Math.max(0, Math.min(x, ballroom.clientWidth - el.offsetWidth));
        y = Math.max(0, Math.min(y, ballroom.clientHeight - el.offsetHeight));
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        repositionChairs(el);
    });
    document.addEventListener('mouseup', () => dragging = false);
}

function repositionChairs(tableEl) {
    const tableObj = tables.find(t => t.element === tableEl);
    if (!tableObj) return;
    const count = tableObj.seats.length;
    const shape = tableObj.shape || (tableEl.classList.contains('rectangular') ? 'rectangular' : (tableEl.classList.contains('round') ? 'round' : 'square'));
    const half = CHAIR_SIZE / 2;
    const left = parseInt(tableEl.style.left);
    const top = parseInt(tableEl.style.top);
    const w = tableEl.offsetWidth;
    const h = tableEl.offsetHeight;

    const positions = [];

    if (shape === 'round') {
        let radius = Math.max(w, h) / 2 + CHAIR_SIZE + CHAIR_GAP;
        const minR = count * (CHAIR_SIZE + CHAIR_GAP) / (2 * Math.PI);
        radius = Math.max(radius, minR);
        const cx = left + w / 2;
        const cy = top + h / 2;
        for (let i = 0; i < count; i++) {
            const angle = (2 * Math.PI / count) * i;
            positions.push({
                x: cx + radius * Math.cos(angle) - half,
                y: cy + radius * Math.sin(angle) - half
            });
        }
    } else if (shape === 'square') {
        const base = Math.floor(count / 4);
        const extra = count % 4;
        const sides = [base, base, base, base];
        for (let i = 0; i < extra; i++) sides[i]++;
        const order = ['top', 'right', 'bottom', 'left'];
        order.forEach((side, idx) => {
            const n = sides[idx];
            for (let i = 0; i < n; i++) {
                const ratio = (i + 1) / (n + 1);
                if (side === 'top') positions.push({ x: left + ratio * w - half, y: top - CHAIR_SIZE - CHAIR_GAP });
                if (side === 'right') positions.push({ x: left + w + CHAIR_GAP, y: top + ratio * h - half });
                if (side === 'bottom') positions.push({ x: left + ratio * w - half, y: top + h + CHAIR_GAP });
                if (side === 'left') positions.push({ x: left - CHAIR_SIZE - CHAIR_GAP, y: top + ratio * h - half });
            }
        });
    } else {
        // rectangular
        const headSeats = tableObj.useHeads ? tableObj.headSeats : 0;
        const longSeats = Math.max(0, count - headSeats * 2);
        const topCount = Math.ceil(longSeats / 2);
        const bottomCount = Math.floor(longSeats / 2);

        // heads (left/right)
        for (let i = 0; i < headSeats; i++) {
            const ratio = (i + 1) / (headSeats + 1);
            positions.push({ x: left - CHAIR_SIZE - CHAIR_GAP, y: top + ratio * h - half });
        }
        for (let i = 0; i < headSeats; i++) {
            const ratio = (i + 1) / (headSeats + 1);
            positions.push({ x: left + w + CHAIR_GAP, y: top + ratio * h - half });
        }

        for (let i = 0; i < topCount; i++) {
            const ratio = (i + 1) / (topCount + 1);
            positions.push({ x: left + ratio * w - half, y: top - CHAIR_SIZE - CHAIR_GAP });
        }
        for (let i = 0; i < bottomCount; i++) {
            const ratio = (i + 1) / (bottomCount + 1);
            positions.push({ x: left + ratio * w - half, y: top + h + CHAIR_GAP });
        }
    }

    positions.forEach((pos, idx) => {
        const ch = tableObj.seats[idx];
        if (!ch) return;
        ch.style.left = pos.x + 'px';
        ch.style.top = pos.y + 'px';
    });
}

function generateColor(existing) {
    let color;
    const used = Object.values(existing)
        .map(c => {
            const m = c.match(/hsl\((\d+)/);
            return m ? parseInt(m[1], 10) : null;
        })
        .filter(v => v !== null);
    let attempts = 0;
    do {
        const hue = Math.floor(Math.random() * 360);
        if (used.every(h => Math.min(Math.abs(hue - h), 360 - Math.abs(hue - h)) >= 30)) {
            color = `hsl(${hue},70%,80%)`;
        }
        attempts++;
    } while (!color && attempts < 100);
    if (!color) color = `hsl(${Math.floor(Math.random()*360)},70%,80%)`;
    return color;
}

function updateGuestOptions() {
    const existing = document.getElementById('baseGuestList');
    if (existing) existing.remove();
    const datalist = document.createElement('datalist');
    datalist.id = 'baseGuestList';
    guests
        .filter(g => (g['RSVP Response'] || '').toLowerCase() !== 'no')
        .forEach(g => {
            const option = document.createElement('option');
            option.value = g.__id;
            option.textContent = `${g['Guest Name']} (${g['Party ID'] || 'No Party'})`;
            datalist.appendChild(option);
        });
    document.body.appendChild(datalist);
}

function updateRoomStats() {
    const guestCount = guests.filter(g => (g['RSVP Response'] || '').toLowerCase() !== 'no').length;
    const seatCount = tables.reduce((sum, t) => sum + t.seats.length, 0);
    const el = document.getElementById('roomStats');
    if (el) {
        el.textContent = `${guestCount} guests / ${seatCount} seats`;
    }
}

function unseatedGuests() {
    return guests
        .filter(g => (g['RSVP Response'] || '').toLowerCase() !== 'no')
        .filter(g => !findChairByGuest(g.__id))
        .sort((a, b) => {
            const pa = a['Party ID'] || '';
            const pb = b['Party ID'] || '';
            if (pa === pb) {
                return a['Guest Name'].localeCompare(b['Guest Name']);
            }
            return pa.localeCompare(pb);
        })
        .map(g => ({
            id: g.__id,
            name: g['Guest Name'],
            party: g['Party ID'] || ''
        }));
}

function showUnseatedGuests() {
    const panel = document.getElementById('tableDetails');
    if (!panel) return;
    panel.innerHTML = '';
    const header = document.createElement('h3');
    header.textContent = 'Unseated Guests';
    panel.appendChild(header);
    const list = document.createElement('ul');
    list.id = 'unseatedList';
    let lastParty = null;
    let colorIndex = -1; // start at -1 so first party increments to 0
    unseatedGuests().forEach(({id, name, party}) => {
        if (party !== lastParty) {
            colorIndex++;
            lastParty = party;
        }
        const li = document.createElement('li');
        li.textContent = name;
        li.dataset.id = id;
        li.classList.add(`party-bg-${colorIndex % 2}`);
        li.draggable = true;
        li.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', id);
        });
        list.appendChild(li);
    });
    panel.appendChild(list);
}

async function seatGuest(chair, id, skipUndo = false) {
    if (!skipUndo) pushUndo('Seat guest');
    const existingChair = findChairByGuest(id);
    if (existingChair && existingChair !== chair) {
        const tObj = tables.find(t => t.seats.includes(existingChair));
        const tId = tObj ? tObj.element.dataset.id : '';
        const guestObj = guests.find(g => g.__id === id) || { 'Guest Name': id };
        const move = await confirmModal(`${guestObj['Guest Name']} is already at table ${tId}. Move them here?`);
        if (!move) return;
        unassignGuest(existingChair, true);
    }
    const tableObj = tables.find(t => t.seats.includes(chair));
    chair.dataset.guest = id;
    const guest = guests.find(g => g.__id === id);
    const name = guest ? guest['Guest Name'] : id;
    chair.dataset.guestName = name;
    chair.textContent = initials(name);
    const partyId = guest ? guest['Party ID'] : '';
    chair.dataset.party = partyId;
    if (tableObj) {
        if (!tableObj.partyColors[partyId]) {
            tableObj.partyColors[partyId] = generateColor(tableObj.partyColors);
        }
        chair.style.background = tableObj.partyColors[partyId];
    }
    if (selectedItem && tableObj && selectedItem === tableObj.element) {
        showTableDetails(tableObj);
    } else {
        showUnseatedGuests();
    }
}

function findChairByGuest(id) {
    for (const table of tables) {
        for (const seat of table.seats) {
            if (seat.dataset.guest === id) return seat;
        }
    }
    return null;
}

function unassignGuest(chair, skipUndo = false) {
    if (!skipUndo) pushUndo('Unseat guest');
    const tableObj = tables.find(t => t.seats.includes(chair));
    const partyId = chair.dataset.party;
    chair.dataset.guest = '';
    chair.dataset.guestName = '';
    chair.dataset.party = '';
    chair.textContent = '';
    chair.style.background = '#ddd';
    if (tableObj && partyId) {
        const still = tableObj.seats.some(s => s.dataset.party === partyId);
        if (!still) delete tableObj.partyColors[partyId];
    }
    if (selectedItem && tableObj && selectedItem === tableObj.element) {
        showTableDetails(tableObj);
    } else {
        showUnseatedGuests();
    }
}

async function seatPartyAtTable(tableObj, partyGuests) {
    const seats = tableObj.seats;
    const open = seats.map((ch, i) => !ch.dataset.guest ? i : null).filter(i => i !== null);
    open.sort((a, b) => a - b);
    let prev = null;
    for (const guest of partyGuests) {
        if (open.length === 0) break;
        let idx;
        if (prev !== null) {
            const total = seats.length;
            const candidates = [prev - 1, prev + 1, (prev + total / 2) % total].map(i => (i + total) % total);
            idx = candidates.find(c => open.includes(c));
        }
        if (idx === undefined) idx = open[0];
        const seat = seats[idx];
        await seatGuest(seat, guest.id, true);
        open.splice(open.indexOf(idx), 1);
        prev = idx;
    }
}

async function autocompleteSeating() {
    const unseated = unseatedGuests();
    if (unseated.length === 0) return;
    const available = tables.reduce((sum, t) => sum + t.seats.filter(ch => !ch.dataset.guest).length, 0);
    if (available < unseated.length) {
        await alertModal(`You need ${unseated.length - available} more seats to fit the rest of your guests`);
        return;
    }
    const parties = {};
    unseated.forEach(g => {
        const p = g.party || '';
        if (!parties[p]) parties[p] = [];
        parties[p].push(g);
    });
    for (const pid of Object.keys(parties)) {
        let group = parties[pid];
        let table = tables.find(t => t.seats.some(ch => ch.dataset.party === pid) && t.seats.filter(ch => !ch.dataset.guest).length >= group.length);
        if (!table) {
            table = tables
                .filter(t => t.seats.filter(ch => !ch.dataset.guest).length >= group.length)
                .sort((a,b) => b.seats.filter(ch=>!ch.dataset.guest).length - a.seats.filter(ch=>!ch.dataset.guest).length)[0];
        }
        if (table) {
            await seatPartyAtTable(table, group);
        } else {
            let remaining = [...group];
            for (const t of tables) {
                const open = t.seats.filter(ch => !ch.dataset.guest).length;
                if (open === 0) continue;
                await seatPartyAtTable(t, remaining.slice(0, open));
                remaining = remaining.slice(open);
                if (remaining.length === 0) break;
            }
        }
    }
    showUnseatedGuests();
    updateRoomStats();
}

function orderedGuestsForTable(tableObj) {
    const unseated = [];
    const parties = new Set();
    tableObj.seats.forEach(ch => {
        if (ch.dataset.party) parties.add(ch.dataset.party);
    });
    parties.forEach(pid => {
        const partyGuests = guests
            .filter(g => g['Party ID'] === pid && (g['RSVP Response'] || '').toLowerCase() !== 'no');
        const seated = tableObj.seats.filter(s => s.dataset.party === pid).map(s => s.dataset.guest);
        if (seated.length < partyGuests.length) {
            partyGuests.forEach(g => {
                if (!seated.includes(g.__id)) unseated.push(g);
            });
        }
    });
    const all = guests
        .filter(g => (g['RSVP Response'] || '').toLowerCase() !== 'no');
    const rest = all.filter(g => !unseated.some(u => u.__id === g.__id));
    return unseated.concat(rest).map(g => ({id: g.__id, name: g['Guest Name'], party: g['Party ID'] || ''}));
}

function assignGuest(chair) {
    const ballroom = document.getElementById('ballroom');
    const existing = ballroom.querySelector('.assign-dropdown');
    const existingList = ballroom.querySelector('#assignOptions');
    if (existing) ballroom.removeChild(existing);
    if (existingList) ballroom.removeChild(existingList);

    const tableObj = tables.find(t => t.seats.includes(chair));
    const options = orderedGuestsForTable(tableObj);

    const datalist = document.createElement('datalist');
    datalist.id = 'assignOptions';
    options.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        datalist.appendChild(opt);
    });

    const input = document.createElement('input');
    input.classList.add('assign-dropdown');
    input.setAttribute('list', 'assignOptions');
    const cleanup = () => {
        if (ballroom.contains(input)) ballroom.removeChild(input);
        if (ballroom.contains(datalist)) ballroom.removeChild(datalist);
    };
    input.addEventListener('change', async () => {
        const id = input.value;
        if (!id) return;

        const existingChair = findChairByGuest(id);
        if (existingChair && existingChair !== chair) {
            const tObj = tables.find(t => t.seats.includes(existingChair));
            const tId = tObj ? tObj.element.dataset.id : '';
            const guestObj = guests.find(g => g.__id === id) || { 'Guest Name': id };
            const move = await confirmModal(`${guestObj['Guest Name']} is already at table ${tId}. Move them here?`);
            if (!move) {
                cleanup();
                return;
            }
            unassignGuest(existingChair);
        }

        seatGuest(chair, id);

        cleanup();
        if (selectedItem && tableObj && selectedItem === tableObj.element) {
            showTableDetails(tableObj);
        }
    });
    input.addEventListener('blur', cleanup);
    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            cleanup();
        }
    });
    input.style.position = 'absolute';
    input.style.left = chair.style.left;
    input.style.top = chair.style.top;
    ballroom.appendChild(datalist);
    ballroom.appendChild(input);
    input.focus();
}

function initials(name) {
    return name.split(/\s+/).map(w => w[0]).join('').toUpperCase();
}

function serializeConfig() {
    const ballroom = document.getElementById('ballroom');
    const tablesData = tables.map(t => {
        const el = t.element;
        const shape = el.classList.contains('rectangular') ? 'rectangular' :
            (el.classList.contains('round') ? 'round' : 'square');
        const seats = t.seats.map(ch => ({
            guest: ch.dataset.guest || '',
            party: ch.dataset.party || ''
        }));
        const data = {
            id: el.dataset.id,
            shape,
            width: el.style.width,
            height: el.style.height,
            left: el.style.left,
            top: el.style.top,
            seats
        };
        if (shape === 'rectangular') {
            data.useHeads = t.useHeads || false;
            data.headSeats = t.headSeats || 0;
        }
        return data;
    });

    const items = Array.from(ballroom.querySelectorAll('.bar, .stage, .dancefloor')).map(el => ({
        type: el.classList.contains('bar') ? 'bar' : (el.classList.contains('stage') ? 'stage' : 'dancefloor'),
        width: el.style.width,
        height: el.style.height,
        left: el.style.left,
        top: el.style.top,
        text: el.textContent
    }));

    return {
        ballroom: {
            width: ballroom.style.width || ballroom.offsetWidth + 'px',
            height: ballroom.style.height || ballroom.offsetHeight + 'px'
        },
        guests,
        tables: tablesData,
        items
    };
}

function clearBallroom() {
    const ballroom = document.getElementById('ballroom');
    while (ballroom.firstChild) ballroom.removeChild(ballroom.firstChild);
    tables = [];
}

function clearAllSeats() {
    pushUndo('Clear all seats');
    tables.forEach(t => {
        t.seats.forEach(ch => {
            if (ch.dataset.guest) {
                unassignGuest(ch, true);
            }
        });
        t.partyColors = {};
    });
    showUnseatedGuests();
    updateRoomStats();
}

function resetLayoutMemory() {
    pushUndo('Reset layout');
    guests = [];
    document.getElementById('guestStatus').textContent = '';
    updateGuestOptions();
    clearBallroom();
    showUnseatedGuests();
    updateRoomStats();
    try {
        localStorage.removeItem('weddingLayout');
    } catch (err) {
        console.error('Failed to clear saved layout', err);
    }
}

function loadConfig(config) {
    clearBallroom();
    guests = (config.guests || []).map((g, i) => {
        if (!g.__id) g.__id = `g${i}`;
        return g;
    });
    updateGuestOptions();
    const ballroom = document.getElementById('ballroom');
    ballroom.style.width = config.ballroom.width;
    ballroom.style.height = config.ballroom.height;
    ballroom.style.minWidth = config.ballroom.width;
    ballroom.style.minHeight = config.ballroom.height;

    (config.tables || []).forEach(t => {
        createTable(t.seats.length, t.shape, {useHeads: t.useHeads, headSeats: t.headSeats});
        const tableObj = tables[tables.length - 1];
        const el = tableObj.element;
        el.style.width = t.width;
        el.style.height = t.height;
        el.style.left = t.left;
        el.style.top = t.top;
        el.dataset.id = t.id;
        el.textContent = t.id;
        repositionChairs(el);
        t.seats.forEach((seat, i) => {
            const ch = tableObj.seats[i];
            const guestObj = guests.find(g => g.__id === seat.guest || g['Guest Name'] === seat.guest) || {};
            ch.dataset.guest = guestObj.__id || seat.guest;
            ch.dataset.guestName = guestObj['Guest Name'] || seat.guest;
            ch.dataset.party = seat.party;
            ch.textContent = seat.guest ? initials(ch.dataset.guestName) : '';
            if (seat.party) {
                if (!tableObj.partyColors[seat.party]) {
                    tableObj.partyColors[seat.party] = generateColor(tableObj.partyColors);
                }
                ch.style.background = tableObj.partyColors[seat.party];
            } else {
                ch.style.background = '#ddd';
            }
        });
    });

    (config.items || []).forEach(it => {
        createRect(it.type, it);
    });
    updateRoomStats();
}

function saveConfig() {
    const data = serializeConfig();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'layout.json';
    a.click();
    URL.revokeObjectURL(url);
    try {
        localStorage.setItem('weddingLayout', JSON.stringify(data));
    } catch (err) {
        console.error('Failed to store layout', err);
    }
}

function loadConfigFromFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
        const config = JSON.parse(e.target.result);
        loadConfig(config);
        try {
            localStorage.setItem('weddingLayout', JSON.stringify(config));
        } catch (err) {
            console.error('Failed to store layout', err);
        }
    };
    reader.readAsText(file);
}

function handleConfigFile() {
    const input = document.getElementById('configFile');
    const file = input.files[0];
    if (!file) return;
    loadConfigFromFile(file);
}

document.getElementById('saveConfig').addEventListener('click', saveConfig);
document.getElementById('loadConfig').addEventListener('click', handleConfigFile);
document.getElementById('clearSeats').addEventListener('click', async () => {
    if (await confirmModal('Clear all seat assignments?')) {
        clearAllSeats();
    }
});
document.getElementById('clearLayout').addEventListener('click', async () => {
    if (await confirmModal('Clear the entire layout and guest list?')) {
        resetLayoutMemory();
    }
});
document.getElementById('autocomplete').addEventListener('click', () => {
    pushUndo('Autocomplete seating');
    autocompleteSeating();
});
document.getElementById('undoAction').addEventListener('click', undoLast);

document.addEventListener('DOMContentLoaded', () => {
    const ballroom = document.getElementById('ballroom');
    ballroom.style.minWidth = ballroom.offsetWidth + 'px';
    ballroom.style.minHeight = ballroom.offsetHeight + 'px';
    ballroom.addEventListener('click', e => {
        if (e.target === ballroom) selectItem(null);
    });
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (/\.csv$/i.test(file.name)) {
            loadGuestsFromFile(file);
        } else if (/\.json$/i.test(file.name)) {
            loadConfigFromFile(file);
        }
    });
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
        if (e.ctrlKey && e.key === 'c') {
            if (selectedItem && selectedItem.classList.contains('table')) {
                const tObj = tables.find(t => t.element === selectedItem);
                tableClipboard = {
                    seats: tObj.seats.length,
                    shape: tObj.shape,
                    width: selectedItem.style.width,
                    height: selectedItem.style.height,
                    left: selectedItem.style.left,
                    top: selectedItem.style.top,
                    useHeads: tObj.useHeads,
                    headSeats: tObj.headSeats
                };
                showToast('Table copied');
            }
            e.preventDefault();
        } else if (e.ctrlKey && e.key === 'v') {
            if (tableClipboard) {
                pushUndo('Paste table');
                createTable(tableClipboard.seats, tableClipboard.shape, {useHeads: tableClipboard.useHeads, headSeats: tableClipboard.headSeats});
                const newTable = tables[tables.length - 1];
                const el = newTable.element;
                el.style.width = tableClipboard.width;
                el.style.height = tableClipboard.height;
                el.style.left = (parseInt(tableClipboard.left || '0') + 20) + 'px';
                el.style.top = (parseInt(tableClipboard.top || '0') + 20) + 'px';
                repositionChairs(el);
                showToast('Table pasted');
            }
            e.preventDefault();
        } else if (e.ctrlKey && e.key === 'z') {
            undoLast();
            e.preventDefault();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            deleteSelectedItem();
            e.preventDefault();
        }
    });
    const saved = localStorage.getItem('weddingLayout');
    if (saved) {
        try {
            const config = JSON.parse(saved);
            loadConfig(config);
        } catch (err) {
            console.error('Failed to load saved layout', err);
        }
    }
    showUnseatedGuests();
    updateRoomStats();
});

function deleteSelectedItem() {
    if (!selectedItem) return;
    pushUndo('Delete selected item');
    if (selectedItem.classList.contains('table')) {
        const idx = tables.findIndex(t => t.element === selectedItem);
        if (idx !== -1) {
            tables[idx].seats.forEach(ch => ch.remove());
            tables.splice(idx, 1);
        }
    }
    selectedItem.remove();
    selectItem(null);
    updateRoomStats();
}

document.getElementById('removeItem').addEventListener('click', deleteSelectedItem);

window.addEventListener('beforeunload', () => {
    try {
        const data = serializeConfig();
        localStorage.setItem('weddingLayout', JSON.stringify(data));
    } catch (err) {
        console.error('Failed to store layout', err);
    }
});
