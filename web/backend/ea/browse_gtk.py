"""Native GTK file chooser for Import Browse.

Runnable as `python3 -m ea.browse_gtk` using a *system* Python that has
PyGObject (`gi`) installed. The project's backend venv intentionally does
not have `gi` (see `ea.browse.gtk_python`); `ea.browse.pick_file` launches
this module as a subprocess with the system interpreter, never imports it
in-process.

Adds two extra widgets to the standard GTK file chooser:
- a "Path:" entry so the operator can paste an absolute path and press
  Enter to jump straight there.
- a "Recent:" dropdown of recently used folders.

Three-way exit code, consumed by `ea.browse._run_gtk`:
- 0: a file was picked; its path is printed to stdout (one line).
- 1: the operator cancelled the dialog. Nothing on stdout. The caller
  must treat this as final and NOT fall back to zenity/kdialog.
- 2: the dialog itself failed (an exception while building/running it).
  Nothing on stdout. The caller falls back to zenity/kdialog.
"""

import argparse
import sys

import gi

gi.require_version("Gtk", "3.0")
from gi.repository import Gtk  # noqa: E402

from ea.browse import resolve_typed_path  # noqa: E402


def _parse_args(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--start", default=None)
    parser.add_argument("--recent", action="append", default=[])
    return parser.parse_args(argv)


def _on_path_activate(entry, dialog):
    resolved = resolve_typed_path(entry.get_text())
    if resolved is None:
        return
    kind, path = resolved
    if kind == "dir":
        dialog.set_current_folder(path)
    else:
        dialog.set_filename(path)


def _on_recent_changed(combo, dialog):
    folder = combo.get_active_text()
    if folder:
        dialog.set_current_folder(folder)


def _stretch_extra_to_dialog(dialog, allocation, extra):
    # GtkFileChooser packs extra_widget with expand=False, so Path/Recent stay
    # at natural width unless we request the chooser's current width.
    target = max(allocation.width - 36, 400)
    current, _ = extra.get_size_request()
    if current != target:
        extra.set_size_request(target, -1)


def build_dialog(start=None, recents=None):
    recents = recents or []
    dialog = Gtk.FileChooserDialog(
        title="Select file",
        action=Gtk.FileChooserAction.OPEN,
    )
    dialog.add_buttons(
        Gtk.STOCK_CANCEL,
        Gtk.ResponseType.CANCEL,
        Gtk.STOCK_OPEN,
        Gtk.ResponseType.OK,
    )
    dialog.set_default_response(Gtk.ResponseType.OK)

    extra = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=4)
    extra.set_hexpand(True)
    extra.set_halign(Gtk.Align.FILL)

    path_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
    path_box.set_hexpand(True)
    path_label = Gtk.Label(label="Path:", xalign=0)
    entry = Gtk.Entry()
    entry.set_placeholder_text("Paste path and press Enter")
    entry.set_hexpand(True)
    entry.set_width_chars(80)
    entry.connect("activate", _on_path_activate, dialog)
    # Label must not expand: Gtk.Box.add() gives both children expand=True, so
    # the entry only got half the row. Pack so the field fills to the right.
    path_box.pack_start(path_label, False, False, 0)
    path_box.pack_start(entry, True, True, 0)
    extra.pack_start(path_box, False, True, 0)

    if recents:
        recent_box = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=6)
        recent_box.set_hexpand(True)
        recent_label = Gtk.Label(label="Recent:", xalign=0)
        combo = Gtk.ComboBoxText()
        combo.set_hexpand(True)
        for r in recents:
            combo.append_text(r)
        combo.connect("changed", _on_recent_changed, dialog)
        recent_box.pack_start(recent_label, False, False, 0)
        recent_box.pack_start(combo, True, True, 0)
        extra.pack_start(recent_box, False, True, 0)

    dialog.set_extra_widget(extra)
    dialog.set_default_size(900, 600)
    dialog.connect("size-allocate", _stretch_extra_to_dialog, extra)

    if start:
        dialog.set_current_folder(start)

    return dialog


def main(argv=None) -> int:
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    try:
        dialog = build_dialog(start=args.start, recents=args.recent)
        dialog.show_all()
        response = dialog.run()
        filename = dialog.get_filename()
        dialog.destroy()
    except Exception:
        # Dialog crashed / could not run: exit 2 (failure), distinct from
        # a plain cancel (exit 1), so the caller falls back to zenity.
        return 2
    if response == Gtk.ResponseType.OK and filename:
        print(filename)
        return 0
    # CANCEL, DELETE_EVENT (dialog closed via window controls), or OK with
    # no filename are all treated as an explicit cancel.
    return 1


if __name__ == "__main__":
    sys.exit(main())
