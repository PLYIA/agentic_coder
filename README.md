# 🤖 Agentic Coder (by PLYIA)

**Agentic Coder** est le premier environnement de développement (IDE) agentique entièrement local, privé et open source. Conçu par **PLYIA**, cet outil permet de concevoir, coder et exécuter vos projets Python et HTML avec la puissance des derniers modèles de langage (LLM) sans aucun passage par le cloud.

## ✨ Fonctionnalités Clés

- 🧠 **Mode Agentic :** Version supérieure de la gestion de fichiers. L'IA agit comme un véritable agent autonome capable de planifier des architectures, créer des arborescences complexes et gérer votre projet de bout en bout.
- ⚡ **Exécution Directe :** Un bouton "Run" intégré pour lancer instantanément vos scripts Python ou prévisualiser vos pages HTML sans quitter l'IDE.
- 🔒 **100% Offline & Privé :** Le premier produit PLYIA entièrement gratuit et open source. Aucune télémétrie, aucun abonnement, une confidentialité totale.
- 🐚 **Terminal Interactif :** Console complète supportant le `stdin` (input()) et l'exécution de commandes shell (pip, ls, git, etc.).
- 📂 **Interface Modern Blur :** UI inspirée de VS Code avec effets de flou (Glassmorphism), gestion d'onglets et explorateur de fichiers fluide.
- 🚀 **Performance GPU :** Optimisé pour l'inférence locale via `llama.cpp` (NVIDIA RTX 4060 Ti+ recommandée).

## 🚀 Modèles Recommandés (2026)

Placez vos fichiers `.gguf` dans le dossier `/models` à la racine du projet. Nous recommandons :

1. **Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf**
    + https://huggingface.co/unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF  
   + *La référence mondiale pour la génération de code et l'exécution de tâches techniques.*
2. **DeepSeek-R1-Distill-Qwen-32B_Q4_K_M.gguf**
   + https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF
   + *Pour un raisonnement logique extrême et une planification agentique précise.*

---

## 🛠️ Installation

### 🐧 Installation sur Linux (Debian/Ubuntu/Arch)
```bash
# 1. Dépendances système pour l'interface Qt6
sudo pacman -S qt6-webengine  # Pour Arch / Manjaro
# OU : sudo apt install python3-pyqt6.qtwebengine # Pour Debian / Ubuntu

# 2. Préparation de l'environnement
git clone https://github.com/votre-username/agentic-coder.git
cd agentic-coder
python -m venv venv
source venv/bin/activate

# 3. Installation avec accélération GPU (CUDA)
CMAKE_ARGS="-DLLAMA_CUDA=on" pip install -r requirements.txt

# 4. Lancer l'IDE
python main.py
```

### 🪟 Installation sur Windows
> **Important :** Vous devez avoir installé [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) avec l'option "Développement Desktop en C++" pour compiler le moteur IA local.

```powershell
# 1. Cloner le projet
git clone https://github.com/votre-username/agentic-coder.git
cd agentic-coder

# 2. Créer l'environnement virtuel
python -m venv venv
.\venv\Scripts\activate

# 3. Installation avec support GPU (CUDA)
# Assurez-vous d'avoir installé le CUDA Toolkit de NVIDIA
$env:CMAKE_ARGS="-DLLAMA_CUDA=on"
pip install -r requirements.txt

# 4. Lancer l'IDE
python main.py
```

---

## ⚙️ Configuration de l'Agent

Piloter l'intelligence artificiel :
- **Mode Agentic :** Autorise l'IA à agir sur votre système de fichiers (création, modification, suppression).
- **Auto-Correction :** L'agent analyse les erreurs remontées dans le terminal et propose une correction automatique.
- **Mode Diff :** L'IA injecte uniquement les lignes modifiées dans l'éditeur Monaco pour une performance maximale.

## 🤝 Open Source & Communauté

Agentic Coder est le premier pas de **PLYIA** vers une suite d'outils créatifs 100% ouverts. Contrairement à nos autres produits, celui-ci restera **gratuit à vie** pour encourager l'innovation dans l'IA locale.

---

Développé avec ❤️ par [PLYIA](https://plyia.github.io/) - *L'IA qui vous appartient.*
