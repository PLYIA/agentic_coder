# 🤖 Agentic Coder (by PLYIA)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python: 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![UI: PyQt6](https://img.shields.io/badge/UI-PyQt6-green.svg)](https://www.riverbankcomputing.com/software/pyqt/)
[![Engine: llama.cpp](https://img.shields.io/badge/Engine-llama.cpp-purple.svg)](https://github.com/ggerganov/llama.cpp)

**Agentic Coder** est l'IDE (Environnement de Développement Intégré) de nouvelle génération : **100% local, privé et agentique**. Conçu par **PLYIA**, il fusionne la puissance d'un éditeur de code moderne (Monaco Editor) avec l'autonomie d'un agent IA capable de concevoir, coder et déboguer vos projets sans jamais quitter votre machine.

[Fonctionnalités](#-fonctionnalités-clés) • [Installation](#%EF%B8%8F-installation) • [Modèles](#-modèles-recommandés) • [Configuration](#-configuration-de-lagent)

---

## ✨ Fonctionnalités Clés

*   🧠 **Intelligence Agentique :** Contrairement à un simple chat, l'IA agit comme un développeur senior local. Elle peut planifier des architectures, créer des dossiers, manipuler plusieurs fichiers et gérer l'arborescence complète de votre projet.
*   ⚡ **Exécution Instantanée :** Environnement de runtime intégré pour **Python** et prévisualisation en temps réel pour le **HTML/CSS/JS**. Un simple clic sur "Run" suffit.
*   🔒 **Confidentialité Totale :** Aucune télémétrie, aucun cloud, aucun abonnement. Vos données et votre code ne quittent jamais votre disque dur.
*   🐚 **Terminal Interactif Pro :** Une console robuste supportant le `stdin` (input utilisateur), la gestion des environnements virtuels et les commandes shell standards.
*   🎨 **Interface "Glassmorphism" :** Une UI ultra-moderne basée sur PyQt6 avec des effets de flou, une gestion d'onglets intuitive et l'intégration de l'éditeur Monaco (le moteur de VS Code).
*   🚀 **Accélération Matérielle :** Optimisé pour l'inférence locale via `llama-cpp-python` avec support complet de CUDA (NVIDIA).

---

## 🚀 Modèles Recommandés

Pour une expérience optimale, placez vos fichiers `.gguf` dans le dossier `/models` situé à la racine du projet.

| Modèle | Usage Recommandé | Lien Hugging Face |
| :--- | :--- | :--- |
| **Qwen2.5-Coder-32B** | Référence pour la génération de code | [Télécharger](https://huggingface.co/bartowski/Qwen2.5-Coder-32B-Instruct-GGUF) |
| **DeepSeek-R1-Distill-32B** | Raisonnement complexe et logique | [Télécharger](https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-32B-GGUF) |
| **Llama-3.1-8B-Lexi** | Projets légers / PC portables | [Télécharger](https://huggingface.co/OuteAI/Llama-3.1-8B-Lexi-GGUF) |

---

## 🛠️ Installation

### Prérequis
- Python 3.10 ou supérieur
- Un GPU NVIDIA (8Go+ VRAM recommandé).

### 🐧 Linux (Ubuntu/Debian/Arch)
```bash
# Installation des dépendances système pour Qt6
sudo apt update && sudo apt install python3-pyqt6.qtwebengine # Debian/Ubuntu
# OU : sudo pacman -S qt6-webengine # Arch

# Clonage et setup
git clone https://github.com/PLYIA/agentic_coder.git
cd agentic_coder
python -m venv venv
source venv/bin/activate

# Installation avec support GPU NVIDIA
CMAKE_ARGS="-DLLAMA_CUDA=on" pip install -r requirements.txt
python main.py
```

### 🪟 Windows
1. Installez [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (C++).
2. Installez les drivers [NVIDIA CUDA Toolkit](https://developer.nvidia.com/cuda-downloads) si vous avez un GPU.

```powershell
git clone https://github.com/PLYIA/agentic_coder.git
cd agentic_coder
python -m venv venv
.\venv\Scripts\activate

# Installation avec accélération GPU
$env:CMAKE_ARGS="-DLLAMA_CUDA=on"
pip install -r requirements.txt

python main.py
```

---

## ⚙️ Configuration de l'Agent

L'interface de configuration vous permet de moduler le comportement de l'IA :

*   **Mode Agentic :** L'IA peut créer et supprimer des fichiers de manière autonome (à utiliser avec précaution).
*   **Auto-Correction :** En cas d'erreur dans le terminal, l'agent analyse la stacktrace et propose immédiatement un correctif.
*   **Mode Diff (par defaut) :** L'IA injecte uniquement les lignes modifiées dans l'éditeur Monaco pour une performance maximale.

---

## 🗺️ Roadmap & État du projet

- [x] Intégration de Monaco Editor.
- [x] Support des modèles GGUF via llama-cpp.
- [x] Terminal interactif avec support `input()`.
- [ ] Support des extensions (LSP).
- [ ] Mode multi-agent (Un architecte + Un codeur).
- [ ] Version exportable en binaire (.exe / .app).

---

## 🤝 Contribuer

Agentic Coder est le fer de lance de la vision **PLYIA** : rendre l'IA accessible, gratuite et privée. Les contributions sont les bienvenues !
1. Forkez le projet.
2. Créez votre branche (`git checkout -b feature/AmazingFeature`).
3. Commitez vos changements (`git commit -m 'Add AmazingFeature'`).
4. Pushez la branche (`git push origin feature/AmazingFeature`).
5. Ouvrez une Pull Request.

---

## 📄 Licence

Distribué sous la licence MIT. Voir `LICENSE` pour plus d'informations.

---

**Développé avec ❤️ par [PLYIA](https://plyia.github.io/)**  
*L'IA qui vous appartient*
