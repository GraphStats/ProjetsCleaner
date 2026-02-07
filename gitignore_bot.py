import itertools
import os
import shutil
import sys
import time

TARGET_FOLDERS = {
    "node_modules",
    "venv",
    ".venv",
    "env",
    ".env",
}


def load_existing_entries(path):
    if not os.path.exists(path):
        return set()
    with open(path, "r", encoding="utf-8") as f:
        return set(line.strip() for line in f if line.strip())


def count_targets(root_dir):
    count = 0
    for _, dirnames, _ in os.walk(root_dir):
        for dirname in dirnames:
            if dirname in TARGET_FOLDERS:
                count += 1
    return count


def ask_root_dir():
    raw = input("Chemin du projet a nettoyer : ").strip()
    raw = raw.strip('"').strip("'")
    if not raw:
        print("Chemin vide, arret.")
        return None
    root = os.path.abspath(raw)
    if not os.path.isdir(root):
        print(f"Chemin invalide: {root}")
        return None
    return root


def ask_mode():
    print("Mode disponible :")
    print("  1) Ajouter dans .gitignore (defaut)")
    print("  2) Supprimer les dossiers trouves")
    choice = input("Votre choix (1/2) : ").strip()
    return "delete" if choice == "2" else "gitignore"


def enable_progress_output():
    if os.name != "nt":
        return
    try:
        import colorama

        colorama.just_fix_windows_console()
        return
    except Exception:
        pass

    try:
        import msvcrt
        import ctypes

        kernel32 = ctypes.windll.kernel32
        handle = msvcrt.get_osfhandle(sys.stdout.fileno())
        mode = ctypes.c_uint32()
        if kernel32.GetConsoleMode(handle, ctypes.byref(mode)):
            kernel32.SetConsoleMode(handle, mode.value | 0x0004)
    except Exception:
        pass


def fmt_time(seconds):
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:02d}h{m:02d}m{s:02d}s"
    if m:
        return f"{m:02d}m{s:02d}s"
    return f"{s:02d}s"


def update_status(spinner_char, message, total, done, start_time, _max_len=[0, 0]):
    message = message.replace("\n", " ")
    status_full = f"{spinner_char} Traitement en cours | Dernier ajout : {message}"

    now = time.time()
    elapsed = now - start_time
    percent = (done / total * 100) if total else 100
    eta = (elapsed * (total - done) / done) if done else 0
    bar_len = 20
    filled = int(percent / 100 * bar_len)
    bar = "#" * filled + "-" * (bar_len - filled)
    progress_full = (
        f"[{bar}] {percent:5.1f}% | ecoule {fmt_time(elapsed)} | reste {fmt_time(eta)}"
    )

    term_width = shutil.get_terminal_size(fallback=(120, 20)).columns
    def trim(text):
        if term_width and len(text) >= term_width:
            cut = max(1, term_width - 4)
            return text[:cut] + "..."
        return text

    status = trim(status_full)
    progress = trim(progress_full)

    _max_len[0] = max(_max_len[0], len(status))
    _max_len[1] = max(_max_len[1], len(progress))
    status_pad = status.ljust(_max_len[0])
    progress_pad = progress.ljust(_max_len[1])

    sys.stdout.write("\r\x1b[2K\x1b[1A\x1b[2K" + status_pad + "\n\x1b[2K" + progress_pad)
    sys.stdout.flush()


def main():
    root_dir = ask_root_dir()
    if not root_dir:
        return
    mode = ask_mode()
    gitignore_path = os.path.join(root_dir, ".gitignore")
    total_targets = count_targets(root_dir)
    start_time = time.time()

    enable_progress_output()
    try:
        sys.stdout.reconfigure(line_buffering=True, write_through=True)
    except Exception:
        pass
    print("Scan demarre")
    print()
    update_status("-", "en attente", total_targets, 0, start_time)

    existing = load_existing_entries(gitignore_path) if mode == "gitignore" else set()
    changes = 0
    processed = 0

    spinner = itertools.cycle("|/-\\")
    gitignore = None
    try:
        if mode == "gitignore":
            gitignore = open(gitignore_path, "a", encoding="utf-8")
            if not existing:
                gitignore.flush()

        for current_path, dirnames, _ in os.walk(root_dir):
            for dirname in dirnames:
                if dirname in TARGET_FOLDERS:
                    full_path = os.path.join(current_path, dirname)
                    relative_path = os.path.relpath(full_path, root_dir)
                    entry = relative_path.replace("\\", "/") + "/"
                    if mode == "gitignore":
                        if entry not in existing:
                            gitignore.write(entry + "\n")
                            gitignore.flush()
                            existing.add(entry)
                            changes += 1
                    else:
                        if os.path.exists(full_path):
                            shutil.rmtree(full_path, ignore_errors=True)
                            changes += 1
                    processed += 1
                    spinner_char = next(spinner)
                    total_effective = total_targets or processed
                    update_status(spinner_char, entry, total_effective, processed, start_time)
                    time.sleep(0.05)
    finally:
        if gitignore:
            gitignore.close()

    if mode == "gitignore":
        final_message = "aucun nouveau dossier" if changes == 0 else "mise a jour terminee"
    else:
        final_message = "aucune suppression" if changes == 0 else "suppressions terminees"
    update_status("OK", final_message)
    sys.stdout.write("\n")
    print("Scan termine")


if __name__ == "__main__":
    main()
