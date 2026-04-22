import os
import shutil
import webview
import threading
import subprocess
import webbrowser
import sys
import time
import json
from pathlib import Path

class Api:
    def __init__(self):
        from core.llm_handler import LLMHandler
        self.llm_handler = LLMHandler()
        self.window = None

        # Détermination des chemins absolus
        self.base_dir = os.path.dirname(os.path.realpath(__file__))
        self.default_workspace = os.path.join(self.base_dir, "workspace", "sandbox")
        self.models_dir = os.path.join(self.base_dir, "models")

        # Création automatique des dossiers si absents
        if not os.path.exists(self.default_workspace):
            os.makedirs(self.default_workspace)
        if not os.path.exists(self.models_dir):
            os.makedirs(self.models_dir)

        self.current_workspace = self.default_workspace
        self.current_open_file = None
        self.active_process = None

        # Réglages par défaut de l'agent
        self.settings = {
            "auto_fix": False,
            "agentic_mode": False
        }

    def set_window(self, window):
        self.window = window

    # --- INITIALISATION ---
    def get_initial_state(self):
        """Envoyé au JS lors du chargement de la page pour configurer l'interface"""
        return {
            "workspace_name": os.path.basename(self.current_workspace),
            "workspace_path": self.current_workspace,
            "tree": self.get_file_tree(self.current_workspace),
            "settings": self.settings
        }

    # --- EXPLORATEUR DE FICHIERS ---
    def get_file_tree(self, path):
        """Scanne le dossier de travail pour l'explorateur"""
        nodes = []
        try:
            if not os.path.exists(path):
                return []
            for item in os.listdir(path):
                if item.startswith('.') and item != ".venv":
                    continue
                if item in ["__pycache__", "node_modules", "venv"]:
                    continue

                full_path = os.path.join(path, item)
                is_dir = os.path.isdir(full_path)

                # Normalisation du chemin pour le JavaScript
                safe_path = full_path.replace("\\", "/")

                nodes.append({
                    "name": item,
                    "path": safe_path,
                    "type": "folder" if is_dir else "file"
                })
            # Tri : Dossiers d'abord, puis alphabétique
            nodes.sort(key=lambda x: (x["type"] != "folder", x["name"].lower()))
        except Exception as e:
            print(f"Erreur Scan : {e}")
        return nodes

    def open_folder_dialog(self):
        """Ouvre la boîte de dialogue système pour changer de dossier"""
        result = self.window.create_file_dialog(webview.FileDialog.FOLDER)
        if result:
            self.current_workspace = result[0]
            self.current_open_file = None
            return {
                "workspace_name": os.path.basename(self.current_workspace),
                "workspace_path": self.current_workspace,
                "tree": self.get_file_tree(self.current_workspace)
            }
        return None

    # --- MANIPULATION DES FICHIERS ---
    def load_file_content(self, file_path):
        """Lit le contenu d'un fichier"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                self.current_open_file = file_path
                return {"success": True, "content": f.read(), "path": file_path}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def set_current_open_file(self, file_path):
        """Synchronise le fichier actif côté backend."""
        try:
            if not file_path:
                self.current_open_file = None
                return {"success": True}
            safe = file_path.replace("\\", "/")
            self.current_open_file = safe
            return {"success": True}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def save_file(self, content, path=None):
        """Sauvegarde le code actuel dans le fichier ouvert ou nouveau"""
        target_path = path if path else self.current_open_file

        # Si c'est un nouveau fichier sans nom
        if not target_path or "new_" in str(target_path):
            save_path = self.window.create_file_dialog(
                webview.FileDialog.SAVE,
                directory=self.current_workspace,
                save_filename="script.py"
            )
            if save_path:
                target_path = save_path if isinstance(save_path, str) else save_path[0]
            else:
                return {"success": False, "message": "Annulé"}

        try:
            with open(target_path, 'w', encoding='utf-8') as f:
                f.write(content)
            self.current_open_file = target_path
            return {"success": True, "path": target_path, "tree": self.get_file_tree(self.current_workspace)}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def save_generated_file(self, filename, content):
        """Sauvegarde forcée d'un fichier créé par l'IA"""
        try:
            path = os.path.abspath(os.path.join(self.current_workspace, filename))
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            return {"success": True, "path": path, "tree": self.get_file_tree(self.current_workspace)}
        except:
            return {"success": False}

    def create_file(self, relative_path):
        """Crée un fichier vide dans le workspace."""
        try:
            rel = (relative_path or "").strip().replace("\\", "/")
            if not rel:
                return {"success": False, "message": "Chemin vide"}
            if os.path.isabs(rel):
                return {"success": False, "message": "Chemin absolu interdit"}
            target = os.path.abspath(os.path.join(self.current_workspace, rel))
            workspace_abs = os.path.abspath(self.current_workspace)
            if not target.startswith(workspace_abs + os.sep) and target != workspace_abs:
                return {"success": False, "message": "Chemin hors workspace"}
            os.makedirs(os.path.dirname(target), exist_ok=True)
            if not os.path.exists(target):
                with open(target, "w", encoding="utf-8") as f:
                    f.write("")
            return {"success": True, "path": target, "tree": self.get_file_tree(self.current_workspace)}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def create_folder(self, relative_path):
        """Crée un dossier dans le workspace."""
        try:
            rel = (relative_path or "").strip().replace("\\", "/")
            if not rel:
                return {"success": False, "message": "Chemin vide"}
            if os.path.isabs(rel):
                return {"success": False, "message": "Chemin absolu interdit"}
            target = os.path.abspath(os.path.join(self.current_workspace, rel))
            workspace_abs = os.path.abspath(self.current_workspace)
            if not target.startswith(workspace_abs + os.sep) and target != workspace_abs:
                return {"success": False, "message": "Chemin hors workspace"}
            os.makedirs(target, exist_ok=True)
            return {"success": True, "path": target, "tree": self.get_file_tree(self.current_workspace)}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def rename_path(self, old_relative_path, new_name):
        """Renomme un fichier ou dossier dans le workspace."""
        try:
            old_rel = (old_relative_path or "").strip().replace("\\", "/")
            new_base = (new_name or "").strip()
            if not old_rel or not new_base:
                return {"success": False, "message": "Parametres invalides"}
            if "/" in new_base or "\\" in new_base:
                return {"success": False, "message": "Le nouveau nom doit etre un nom simple"}

            old_abs = os.path.abspath(os.path.join(self.current_workspace, old_rel))
            ws_abs = os.path.abspath(self.current_workspace)
            if not old_abs.startswith(ws_abs + os.sep):
                return {"success": False, "message": "Chemin hors workspace"}
            if not os.path.exists(old_abs):
                return {"success": False, "message": "Cible introuvable"}

            parent = os.path.dirname(old_abs)
            new_abs = os.path.join(parent, new_base)
            if os.path.exists(new_abs):
                return {"success": False, "message": "Une cible avec ce nom existe deja"}

            os.rename(old_abs, new_abs)
            return {"success": True, "old_path": old_abs, "new_path": new_abs, "tree": self.get_file_tree(self.current_workspace)}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def delete_path(self, relative_path):
        """Supprime un fichier ou dossier dans le workspace."""
        try:
            rel = (relative_path or "").strip().replace("\\", "/")
            if not rel:
                return {"success": False, "message": "Chemin vide"}

            target = os.path.abspath(os.path.join(self.current_workspace, rel))
            ws_abs = os.path.abspath(self.current_workspace)
            if not target.startswith(ws_abs + os.sep):
                return {"success": False, "message": "Chemin hors workspace"}
            if not os.path.exists(target):
                return {"success": False, "message": "Cible introuvable"}

            if os.path.isdir(target):
                shutil.rmtree(target)
            else:
                os.remove(target)

            if self.current_open_file and os.path.abspath(self.current_open_file).startswith(target):
                self.current_open_file = None

            return {"success": True, "deleted_path": target, "tree": self.get_file_tree(self.current_workspace)}
        except Exception as e:
            return {"success": False, "message": str(e)}

    # --- TERMINAL ET ENVIRONNEMENT ---
    def check_venv(self):
        """Vérifie si un venv est présent pour l'UI"""
        for venv_name in [".venv", "venv", "env"]:
            if os.path.exists(os.path.join(self.current_workspace, venv_name)):
                return {"active": True, "name": venv_name}
        return {"active": False, "name": "Global"}

    def _get_python_executable(self):
        """Détecte l'exécutable Python correct (Venv ou Système)"""
        for venv_name in [".venv", "venv", "env"]:
            p = os.path.join(self.current_workspace, venv_name, "bin", "python")
            if os.path.exists(p): return p
            p = os.path.join(self.current_workspace, venv_name, "Scripts", "python.exe")
            if os.path.exists(p): return p
        return sys.executable

    def get_dependencies(self):
        """Récupère la liste des packages pip"""
        try:
            py = self._get_python_executable()
            res = subprocess.run([py, "-m", "pip", "list", "--format=json"], capture_output=True, text=True)
            return json.loads(res.stdout) if res.returncode == 0 else []
        except:
            return []

    def send_terminal_input(self, text):
        """Envoie du texte au stdin du processus ou exécute un Shell"""
        if self.active_process and self.active_process.poll() is None:
            try:
                self.active_process.stdin.write(text + '\n')
                self.active_process.stdin.flush()
            except: pass
        else:
            # Mode Shell interactif
            def run_shell():
                try:
                    proc = subprocess.Popen(text, shell=True, cwd=self.current_workspace, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
                    for line in iter(proc.stdout.readline, ''):
                        if line: self.window.evaluate_js(f"appendToTerminal({json.dumps(line)})")
                    proc.wait()
                    self.window.evaluate_js("refreshEnvironmentStatus()")
                except Exception as e:
                    self.window.evaluate_js(f"appendToTerminal({json.dumps(str(e))}, 'text-red-500')")
            threading.Thread(target=run_shell, daemon=True).start()
        return True

    def run_current_file(self):
        """Exécute le fichier actuel"""
        if not self.current_open_file:
            return {"success": False, "output": "> Erreur : Aucun fichier ouvert."}

        ext = self.current_open_file.split('.')[-1].lower()
        if ext == 'py':
            def run_thread():
                time.sleep(0.2)
                try:
                    env = os.environ.copy()
                    env["PYTHONUNBUFFERED"] = "1"
                    python_bin = self._get_python_executable()

                    self.active_process = subprocess.Popen(
                        [python_bin, "-u", self.current_open_file],
                        cwd=self.current_workspace,
                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                        text=True, env=env, bufsize=0
                    )

                    while True:
                        proc = self.active_process
                        if proc is None:
                            break
                        chunk = proc.stdout.read(64)
                        if not chunk and proc.poll() is not None:
                            break
                        if chunk:
                            # Envoi par blocs pour accélérer l'affichage terminal.
                            self.window.evaluate_js(f"appendToTerminal({json.dumps(chunk)})")

                    if self.active_process:
                        code = self.active_process.wait()
                        self.window.evaluate_js(f"onProcessFinished({code})")
                        self.active_process = None
                except Exception as e:
                    self.window.evaluate_js(f"appendToTerminal({json.dumps(str(e))})")

            threading.Thread(target=run_thread, daemon=True).start()
            return {"success": True, "async": True}

        elif ext in ['html', 'htm']:
            webbrowser.open_new_tab('file://' + os.path.realpath(self.current_open_file))
            return {"success": True, "output": "> Navigateur ouvert.", "async": False}

        return {"success": False, "async": False}

    def stop_current_process(self):
        if self.active_process:
            self.active_process.terminate()
            self.active_process = None
        return True

    # --- MOTEUR IA ---
    def get_models(self):
        if not os.path.exists(self.models_dir): return []
        return [f for f in os.listdir(self.models_dir) if f.endswith(".gguf")]

    def select_model(self, name):
        path = os.path.join(self.models_dir, name)
        return self.llm_handler.load_model(path)

    def save_settings(self, s):
        self.settings.update(s)
        return True

    def get_settings(self):
        return self.settings

    def _build_project_map(self, max_depth=4, max_entries=400):
        """Construit une vue hiérarchique légère du workspace courant."""
        root = Path(self.current_workspace)
        ignored_dirs = {"__pycache__", "node_modules", "venv", ".venv", ".git"}
        lines = [f"/{root.name}"]
        count = 0

        def walk(path, prefix, depth):
            nonlocal count
            if depth > max_depth or count >= max_entries:
                return
            try:
                items = sorted(path.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
            except Exception:
                return

            filtered = []
            for item in items:
                if item.name.startswith('.') and item.name not in {".env"}:
                    continue
                if item.is_dir() and item.name in ignored_dirs:
                    continue
                filtered.append(item)

            for i, item in enumerate(filtered):
                if count >= max_entries:
                    break
                is_last = i == len(filtered) - 1
                branch = "└── " if is_last else "├── "
                lines.append(f"{prefix}{branch}{item.name}{'/' if item.is_dir() else ''}")
                count += 1
                if item.is_dir():
                    next_prefix = f"{prefix}{'    ' if is_last else '│   '}"
                    walk(item, next_prefix, depth + 1)

        walk(root, "", 0)
        if count >= max_entries:
            lines.append("... (hierarchie tronquee)")
        return "\n".join(lines)

    def apply_diff_to_file(self, relative_path, search, replace):
        """Applique un search/replace sur un fichier du workspace."""
        try:
            rel = (relative_path or "").strip().replace("\\", "/")
            if not rel:
                return {"success": False, "message": "Chemin vide"}
            if os.path.isabs(rel):
                return {"success": False, "message": "Chemin absolu interdit"}

            target = os.path.abspath(os.path.join(self.current_workspace, rel))
            workspace_abs = os.path.abspath(self.current_workspace)
            if not target.startswith(workspace_abs + os.sep) and target != workspace_abs:
                return {"success": False, "message": "Chemin hors workspace"}
            if not os.path.exists(target):
                return {"success": False, "message": "Fichier introuvable"}
            if os.path.isdir(target):
                return {"success": False, "message": "Cible invalide (dossier)"}

            with open(target, "r", encoding="utf-8") as f:
                content = f.read()
            if search not in content:
                return {"success": False, "message": "Bloc <search> non trouve"}

            updated = content.replace(search, replace, 1)
            with open(target, "w", encoding="utf-8") as f:
                f.write(updated)
            return {"success": True, "path": target, "tree": self.get_file_tree(self.current_workspace)}
        except Exception as e:
            return {"success": False, "message": str(e)}

    def stop_generation(self):
        self.llm_handler.stop()

    def send_to_agent(self, chat_history, full_code, selected_code, options):
        def run():
            self.window.evaluate_js("prepareForResponse()")
            def callback(token):
                self.window.evaluate_js(f"appendToken({json.dumps(token)})")

            fname = os.path.basename(self.current_open_file or "Code")
            wname = os.path.basename(self.current_workspace)

            opts = options or {}
            self.llm_handler.stream_answer(
                chat_history,
                full_code,
                selected_code,
                fname,
                wname,
                self._build_project_map(),
                callback,
                selected_model=opts.get('selected_model', ""),
                current_language=opts.get('current_language', ""),
                agentic_mode=opts.get('agentic_mode', False)
            )
            self.window.evaluate_js("onStreamFinished()")
        threading.Thread(target=run, daemon=True).start()
        return True

def main():
    api = Api()
    base_path = os.path.dirname(os.path.realpath(__file__))
    index_html = os.path.join(base_path, "ui", "index.html")

    window = webview.create_window(
        'Agentic Coder - by PLYIA',
        index_html,
        js_api=api,
        width=1500,
        height=950,
        background_color='#05070a'
    )

    api.set_window(window)
    # http_server=True permet de charger assets/ via le serveur interne
    webview.start(debug=True, http_server=True)

if __name__ == "__main__":
    main()
