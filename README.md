<p align="center">
  <img src="./favicon.svg" width="96" height="96" alt="GaborNeuroFit Logo">
</p>

<h1 align="center">GaborNeuroFit</h1>

<p align="center">
  <strong>High-Performance Dichoptic, Strabismus & Perceptual Learning Vision Therapy Suite</strong>
</p>

<p align="center">
  <!-- Automated GitHub Actions Build & Deploy Status -->
  <a href="https://github.com/imKeim/GaborNeuroFit/actions/workflows/deploy.yml"><img src="https://github.com/imKeim/GaborNeuroFit/actions/workflows/deploy.yml/badge.svg" alt="Build & Deploy Status"></a>
  <!-- GNU GPL v3 License -->
  <a href="https://www.gnu.org/licenses/gpl-3.0"><img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License: GPL v3"></a>
  
  <!-- Core Arch & Languages -->
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=flat&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=flat&logo=Vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white" alt="CSS3">

  <!-- Testing Pyramid & QA -->
  <img src="https://img.shields.io/badge/Vitest-Unit_Tests-729B1B?style=flat&logo=vitest&logoColor=white" alt="Vitest">
  <img src="https://img.shields.io/badge/Playwright-E2E-2EAD33?style=flat&logo=playwright&logoColor=white" alt="Playwright">
  <img src="https://img.shields.io/badge/Dependabot-Active-025E8C?style=flat&logo=dependabot&logoColor=white" alt="Dependabot">

  <!-- Clinical Hardware APIs -->
  <img src="https://img.shields.io/badge/Web%20Audio-FF5722?style=flat&logo=soundcharts&logoColor=white" alt="Web Audio API">
  
  <!-- Platforms & Open Source status -->
  <img src="https://img.shields.io/badge/Platform-Web%20%7C%20Mobile-brightgreen" alt="Platform">
  <img src="https://img.shields.io/badge/Open%20Source-%E2%9D%A4-red" alt="Open Source">
</p>

<p align="center">
  GaborNeuroFit is a serverless, cross-platform web application designed for amblyopia ("lazy eye") rehabilitation, visual crowding correction, and contrast sensitivity training. It uniquely combines monocular occlusion (patching) and advanced dichoptic (3D anaglyph) visual stimulation under a unified, scientifically backed clinical framework.
</p>

<p align="center" style="font-size: 1.25em; font-weight: bold;">
  <a href="https://imkeim.github.io/GaborNeuroFit/">▶️ PLAY GABORNEUROFIT LIVE NOW</a>
</p>

## ✍️ A Note from the Author: From Frustration to Healing

My name is Pavel. I have had anisometropic amblyopia (lazy eye caused by unequal refractive power between the eyes) since childhood. At age 26, after undergoing laser eye correction, I set a goal: to do whatever it took to wake up my lazy eye and teach my brain to see binocularly.

I searched the entire Internet for recovery software, but found **absolutely nothing** of clinical value. The existing training methods were incredibly tedious and frustrating. Staring at flat text or trying to read with a lazy eye is an exhausting chore. All you can think is: *"I just want to read this line like a normal person!"* It feels like a punishment, not a path to healing.

During my research, I discovered the Steam game *BiColor - Lazy Eye Game Trainer*. I want to give special thanks to its creator because the idea of coloring shapes in 3D glasses was a beautiful spark of inspiration. However, because I completely lack motor fusion (binocular alignment), I experienced a constant physical gap between the two eyes' images. Without proper binocular fusion locks, my lazy eye drifted uncontrollably.

When I consulted local eye clinics, they simply shook their heads: *"We don't treat adult amblyopia. Give up."*

I refused to accept that. I dove into visual neuroscience, studying spatial frequencies, lateral inhibition, and binocular gating. I partnered with the **Gemini 1.5 Flash** neural network, and together we built this software. Under the hood, the code is optimized for performance and clinical precision. I wrote this because nobody else would build it for us. I hope it brings you and your children the progress you've been fighting for.

## 🔬 The Scientific "Whys"

### Why Gabor Patches? (🧿)

Gabor patches are the "letters" of the primary visual cortex ($V1$). The simple cells in your brain's occipital lobe are strictly tuned to detect lines at specific angles. By forcing your weaker eye to resolve these faint, blurry lines right at your sensory threshold, you directly drive synaptic remodeling (Hebbian plasticity) in $V1$.

### Why Red-Cyan 3D Glasses? (🕶️)

Patching (occlusion) is a monocular treatment, but it doesn't cure **binocular suppression** (the brain actively blocking the lazy eye). 3D glasses split the color channels. The lazy eye sees the target (Gabor), while the healthy eye sees the noise. To solve the task, the brain has no choice but to combine the signals, breaking the suppression loop.

### Why Flanker Distractors? (🩹)

A lazy eye struggles to read because surrounding letters blur together (the "visual crowding effect"). By presenting the Gabor target to your lazy eye and the flanking distractors to your healthy eye, we train the brain to separate target details under active binocular noise.

### Why Flicker (10 Hz)? (🌀)

Flickering the stimulus at 10 Hz (Alpha frequency) forces your visual cortex into resonance (SSVEP). This rapid pulsing overloads and bypasses the brain's slow top-down suppression mechanisms and prevents **Troxler's fading** (the disappearing of static low-contrast objects).

### Why a Digital Synoptophore? (🧲)

Amblyopia and Strabismus (misaligned eyes) are deeply connected. If your muscles cannot physically align your eyes, the brain will suppress the lazy eye to avoid double vision. The digital Synoptophore bridges this gap: you align the targets to your exact squint angle (sensory fusion), and the software slowly pulls them back to true center (0,0), forcing your eye muscles to contract and build binocular stamina.

## 🎮 Clinical Training Protocols

GaborNeuroFit features 6 scientifically structured active templates:

*   🩹 **Classic Occlusion (Patching)**: The traditional starting point. Monochrome Gabor, meant to be used with a physical eye patch over your strong eye.
*   ⚡ **Cortical Speed Blitz**: A high-intensity monochrome speed run. 100 ms flashes to train rapid feedforward processing.
*   🕶️ **Binocular Balance (3D)**: Both eyes open with 3D glasses. Central Gabor is shown to the lazy eye, and faint distractors to the healthy eye.
*   🌀 **Flicker Resonance (3D)**: The "heavy artillery" mode. The Gabor and distractors pulse at 10 Hz to break deep, stubborn suppression barriers.
*   🎯 **Parafoveal Capture (3D)**: The target Gabor jumps to the periphery, forcing your lazy eye to coordinate spatial attention and fast localization.
*   ⚙️ **Custom Configuration**: Unlocks all individual toggles for clinicians to design custom training routines.
*   🧲 **Synoptophore (3D Vergence)**: A specialized orthoptic simulator targeting strabismus. You manually align targets, then the software slowly pulls them to center to train ocular muscles.

## 🏃‍♂️ How to Train Correctly

1.  **Wear your correction:** If you wear glasses or contact lenses, put them on.
2.  **Positioning:** Hold your device at a comfortable arm's length (**60–70 cm**).
3.  **🎯 LOOK ONLY AT THE CENTER:** Fix your gaze strictly on the central cross (+). Do not chase the flashing Gabor patch. Use your peripheral attention to resolve the tilt.
4.  **Frequency:** Train for 15 minutes a day (roughly 100–150 attempts). Rest is critical for consolidating visual memory.
5.  **Listen to your body:** If your eyes water or feel painful, stop immediately.

## 🧭 Quick Start Guide

### ⚡ "I clicked START and it flashed for a split second! Is it broken?"

No. The flash is supposed to be fast (100–220 ms). This prevents your strong eye's muscles from adjusting and "cheating". **Do not analyze the lines.** Trust your pure instinct and click Left or Right immediately.

### 👓 "The images don't align! I see a double image"

Open the settings and drag the **Strong Eye Contrast Balancer** slider down to **15% or 20%**. This makes the healthy eye's image faint, allowing your brain to easily ignore the drift while your weak eye's pathway adapts.

### 🌀 "I feel like I'm completely guessing. Is this even doing anything?"

Yes! Perceptual learning operates at the absolute threshold. Trust the adaptive staircase. If your accuracy is above 70%, your visual cortex is resolving the pattern subliminally. This "struggle" is where the brain remodels its synapses.

### 🧲 "How do I use the Synoptophore Mode?"

1. Use WASD, Arrow keys, or touch to move the outer ring until the center dot is perfectly inside it (matching your squint angle).
2. Click **"LOCK FUSION"**. The software will now slowly pull the ring back to the center (0,0).
3. Do not let the dot slip out! If it does, press **"SLIPPED / RESET"** and try again.

## 📚 Key Scientific Literature

*   **Hess, R. F., et al. (2010).** *Binocular dichoptic training facilitates binocular vision in adults with amblyopia.* (Dichoptic training vs. patching).
*   **Polat, U., et al. (2004).** *Collinear stimuli facilitate visual acuity in adults with amblyopia.* (Gabor-based perceptual learning).
*   **Levi, D. M., & Li, R. W. (2009).** *Perceptual learning as a potential treatment for amblyopia: a mini-review.* (Synaptic plasticity in adult V1).
*   **Scheiman, M., et al. (2005).** *A randomized clinical trial of vision therapy/orthoptics versus pencil pushups for the treatment of convergence insufficiency in children.* (Proves the clinical superiority of structured orthoptic/vergence exercises).