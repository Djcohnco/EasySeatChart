# Wedding Seating Chart Editor

This project is a browser-based tool for planning wedding (or other event) seating arrangements. It lets you import your guest list, build a custom ballroom layout with tables and other items, and assign guests to seats by drag and drop. The app runs entirely in the browser and stores layouts in `localStorage`.

## Features

- **Flexible room designer** – Add tables, bars, dance floors or stages, and resize them directly inside the ballroom area.
- **Multiple table shapes** – Tables can be square, rectangular (optionally with head seating), or round.
- **CSV guest list import/export** – Upload a guest list from a CSV file. After seating, export the list with table assignments.
- **Save and load layouts** – Save the entire ballroom configuration to a JSON file and load it later.
- **Drag and drop seating** – Drag unseated guests to any chair or use the dropdown to assign them.
- **Automatic seating** – An Autocomplete button seats remaining guests while trying to keep parties together.
- **Undo support and shortcuts** – Undo the last change with `Ctrl+Z`, copy/paste tables with `Ctrl+C` / `Ctrl+V`.

## Getting started

1. Clone this repository or download the files.
2. Open `index.html` in a modern web browser. Because the tool uses `FileReader` and `localStorage`, it works from the filesystem but running a small local server (`python3 -m http.server`) is recommended.

Once open, you'll see the main interface with options to load guests and manage the room layout.

## Importing guests

Use the **File Options** section to load a CSV guest list. Supported formats include exports from sites such as The Knot or Zola and a generic `"Party ID, Guest Name, Responded, RSVP Response"` format.

```html
<details id="fileMenu">
    <summary>File Options</summary>
    ...
    <button id="loadGuests" title="Load a guest list from a CSV or XLSX file">Load Guests</button>
    <button id="exportGuests" title="Download the current guest list with table assignments">Export Guest List</button>
    <input type="file" id="configFile" accept=".json" />
    <button id="loadConfig" title="Load a previously saved seating layout">Load Layout</button>
    <button id="saveConfig" title="Save the current seating layout to a JSON file">Save Layout</button>
</details>
```
【F:index.html†L12-L22】

After loading guests you'll see the count displayed and a list of unseated guests in the sidebar.

## Designing the ballroom

Use the **Room Configuration** panel to add tables or other items. Choose the table shape, seat count and number of copies, then click **Add Item**. Selected tables can be resized and repositioned. The controls for adding items are defined in `index.html`:

```html
<div id="roomConfig">
    <label>Item Type
        <select id="itemType">
            <option value="table">Table</option>
            <option value="bar">Bar</option>
            <option value="dancefloor">Dancefloor</option>
            <option value="stage">Stage</option>
        </select>
    </label>
    <label>Table Shape
        <select id="tableShape">
            <option value="square">Square</option>
            <option value="rectangular">Rectangle</option>
            <option value="round">Round</option>
        </select>
    </label>
    <label>Seats per Table
        <input type="number" id="seatCount" min="1" value="8">
    </label>
    <label>Number to Add
        <input type="number" id="itemCount" min="1" value="1">
    </label>
    <button id="addItem">Add Item</button>
    <button id="removeItem" class="delete-button">Remove Selected</button>
    <div id="roomStats"></div>
</div>
```
【F:index.html†L27-L53】

## Seating guests

Drag a name from the **Unseated Guests** list onto an empty chair or click a chair to choose a guest from a dropdown. Chairs show the initials of the seated guest. Use **Clear Seats** to unassign everyone or **Clear Layout** to remove the entire room setup.

The Autocomplete button attempts to seat all remaining guests, keeping parties together whenever possible (see `autocompleteSeating` in `script.js`).

## Saving and loading

- **Save Layout** exports the current configuration as `layout.json` and stores it in browser storage.
- **Load Layout** reads a previously saved file and restores the room.
- **Export Guest List** downloads a CSV with an extra `Table` column that lists each guest's assigned table.

## Keyboard shortcuts

The application supports several shortcuts as registered in `script.js`:

- `Ctrl+C` copies the currently selected table.
- `Ctrl+V` pastes a copy of the table at an offset.
- `Ctrl+Z` undoes the most recent action.
- `Delete` removes the currently selected item.

## Customization

All styling is contained in `style.css`. A modern font and color palette are defined at the top of the file:

```css
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');
:root {
    --bg-color: #f8f9fa;
    --surface-color: #ffffff;
    --primary-text-color: #212529;
    --secondary-text-color: #6c757d;
    --border-color: #dee2e6;
    --accent-color: #0d6efd;
    --accent-color-light: #cfe2ff;
    --danger-color: #dc3545;
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
    --border-radius-sm: 0.25rem;
    --border-radius-md: 0.5rem;
}
```
【F:style.css†L1-L18】

Feel free to adjust these variables or any other styles to match your event.

## Browser support

The editor relies on modern browser APIs such as `FileReader`, `drag and drop` and `localStorage`. It works in recent versions of Chrome, Firefox and Edge.

## Contributing

Pull requests are welcome! Feel free to open an issue for feature requests or problems you encounter.

## License
Released under the [MIT License](LICENSE).

