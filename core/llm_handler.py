import gc
import os
from llama_cpp import Llama

class LLMHandler:
    """
    Gère le chargement du modèle GGUF et l'inférence.
    Supporte le mode Auto-Fichier (XML) et le mode Diff (Search/Replace).
    """
    def __init__(self):
        self.llm = None
        self.current_path = None
        self._stop_flag = False

    def load_model(self, path):
        """Charge le modèle en VRAM. Libère l'ancien si nécessaire."""
        if self.current_path == path:
            return True

        if self.llm:
            del self.llm
            gc.collect()

        try:
            # Configuration optimisée pour RTX 4060 Ti 16Go
            self.llm = Llama(
                model_path=path,
                n_gpu_layers=-1, # Tout sur GPU
                n_ctx=8192,      # Contexte suffisant pour du code
                n_threads=8,
                verbose=False
            )
            self.current_path = path
            return True
        except Exception as e:
            print(f"Erreur chargement LLM : {e}")
            return False

    def stop(self):
        """Active le signal d'arrêt pour l'inférence en cours."""
        self._stop_flag = True

    def stream_answer(
        self,
        chat_history,
        full_code,
        selected_code,
        filename,
        workspace,
        project_map,
        callback,
        selected_model="",
        current_language="",
        agentic_mode=False
    ):
        """
        Génère la réponse en streaming.
        Adapte le Prompt Système selon l'état du bouton Auto-Fichiers.
        """
        if not self.llm:
            callback("Erreur : Aucun modèle chargé.")
            return

        self._stop_flag = False

        # --- CONSTRUCTION DU PROMPT SYSTÈME ---
        context_focus = f"L'utilisateur a surligné ce code :\n{selected_code}" if selected_code else ""

        base_prompt = (
            f"Tu es Agentic Coder, un ingénieur logiciel expert.\n"
            f"Workspace actuel : {workspace}\n"
            f"Fichier actif : {filename}\n"
            f"Langage détecté : {current_language or 'inconnu'}\n"
            f"Modèle sélectionné UI : {selected_model or 'inconnu'}\n"
            f"Hierarchie du projet :\n{project_map}\n\n"
            f"Code actuel dans l'éditeur :\n```\n{full_code}\n```\n\n"
            f"{context_focus}\n"
        )

        rules = (
            "MODE DIFF STRICT (mode de base) :\n"
            "- Pour modifier le code, utilise UNIQUEMENT ce format complet :\n"
            "  <diff>\n"
            "  <search>\nbloc exact existant\n</search>\n"
            "  <replace>\nnouveau code complet\n</replace>\n"
            "  </diff>\n"
            "- Interdiction absolue de fermer <diff> juste apres </search>.\n"
            "- Un bloc <diff> SANS <replace> est invalide.\n"
            "- Règle : <search> doit être un copier-coller PARFAIT d'un bloc existant.\n"
            "- Si la modification est importante, emets plusieurs blocs <diff> valides.\n"
            "- Tu peux aussi creer/remplacer un fichier complet via :\n"
            "  <file name=\"chemin/relatif.ext\">contenu complet</file>"
        )

        agentic_rules = ""
        if agentic_mode:
            agentic_rules = (
                "\nMODE AGENTIC ACTIF :\n"
                "- Agis comme un agent logiciel autonome.\n"
                "- Tu peux explorer la structure du projet fournie et t'en servir pour choisir les bons fichiers.\n"
                "- Prends des initiatives utiles sans demander chaque micro-étape.\n"
                "- Priorise des correctifs complets, robustes et cohérents.\n"
                "- Si le besoin est ambigu, fais l'hypothèse la plus raisonnable puis avance.\n"
                "- Si la demande est de type projet complet (ex: 'dans le dossier X fais Y'), cree la structure necessaire dans ce dossier.\n"
                "- Si un dossier cible n'existe pas, cree-le explicitement avec : <folder name=\"chemin/dossier\" />.\n"
                "- Pour les demandes de jeu/app (ex: pygame), fournis un projet runnable de bout en bout: boucle principale, assets/code, collisions, controles, logique metier.\n"
                "- Si des dependances sont necessaires, indique-les en tete de reponse puis integre le code complet des fichiers.\n"
                "- Pour modifier un fichier précis, prefere ce format :\n"
                "  <diff file=\"chemin/relatif/vers/fichier.ext\">\n"
                "  <search>bloc exact</search>\n"
                "  <replace>nouveau bloc</replace>\n"
                "  </diff>\n"
                "- Pour creer un nouveau projet/fichier, utilise <file name=\"chemin/relatif.ext\">contenu complet</file>.\n"
                "- Pour une demande 'dans le dossier X', n'edite pas arbitrairement des fichiers existants hors X sans justification.\n"
                "- N'ecris pas de pseudo-code: seulement du code executable."
            )

        system_instruction = base_prompt + rules + agentic_rules

        # --- PRÉPARATION DES MESSAGES (Historique) ---
        messages = [{"role": "system", "content": system_instruction}]
        for msg in chat_history:
            messages.append({"role": msg["role"], "content": msg["content"]})

        try:
            stream = self.llm.create_chat_completion(
                messages=messages,
                stream=True,
                temperature=0.1 # Précision maximale pour le code
            )

            for chunk in stream:
                if self._stop_flag:
                    break
                if 'content' in chunk['choices'][0]['delta']:
                    token = chunk['choices'][0]['delta']['content']
                    callback(token)

        except Exception as e:
            callback(f"\n[ERREUR IA] : {str(e)}")
