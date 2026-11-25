import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { ArrowRight, Sparkles, Music2, Camera, Play, ShieldCheck } from 'lucide-react';

// Komponen Halaman Masuk Ultra Kreatif & Interaktif 3D
export default function SplashScreen({ onEnter }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 6.2;

    // 2. Renderer dengan anti-aliasing tinggi & alpha
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    // 3. Pencahayaan Dinamis (Cyan, Magenta, Indigo)
    const ambientLight = new THREE.AmbientLight(0x0a1128, 1.2);
    scene.add(ambientLight);

    const cyanLight = new THREE.PointLight(0x06b6d4, 4, 25);
    cyanLight.position.set(4, 3, 3);
    scene.add(cyanLight);

    const pinkLight = new THREE.PointLight(0xec4899, 4, 25);
    pinkLight.position.set(-4, -3, 3);
    scene.add(pinkLight);

    const purpleLight = new THREE.PointLight(0x8b5cf6, 3, 20);
    purpleLight.position.set(0, 4, -2);
    scene.add(purpleLight);

    // 4. Grup Hologram Inti 3D (Cyber Core)
    const coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // 4a. Inti Dalam: Icosahedron Wireframe bercahaya neon
    const innerGeo = new THREE.IcosahedronGeometry(0.9, 1);
    const innerMat = new THREE.MeshStandardMaterial({
      color: 0xec4899,
      emissive: 0xec4899,
      emissiveIntensity: 2.2,
      wireframe: true,
      roughness: 0.2,
      metalness: 0.8
    });
    const innerCore = new THREE.Mesh(innerGeo, innerMat);
    coreGroup.add(innerCore);

    // Kristal transparan di dalam inti
    const crystalGeo = new THREE.OctahedronGeometry(0.55, 0);
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.5,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.9,
      thickness: 1.2,
      reflectivity: 1.0,
      clearcoat: 1.0
    });
    const crystalMesh = new THREE.Mesh(crystalGeo, crystalMat);
    innerCore.add(crystalMesh);

    // 4b. Cincin Gyroscope Orbital Konsentris
    const ringMaterials = [
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: 0x06b6d4,
        emissiveIntensity: 1.6,
        roughness: 0.3,
        metalness: 0.9
      }),
      new THREE.MeshStandardMaterial({
        color: 0x8b5cf6,
        emissive: 0x8b5cf6,
        emissiveIntensity: 1.6,
        roughness: 0.3,
        metalness: 0.9
      }),
      new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xf43f5e,
        emissiveIntensity: 1.6,
        roughness: 0.3,
        metalness: 0.9
      })
    ];

    const ring1Geo = new THREE.TorusGeometry(1.55, 0.035, 24, 120);
    const ring1 = new THREE.Mesh(ring1Geo, ringMaterials[0]);
    ring1.rotation.x = Math.PI / 3;
    coreGroup.add(ring1);

    const ring2Geo = new THREE.TorusGeometry(1.95, 0.03, 24, 120);
    const ring2 = new THREE.Mesh(ring2Geo, ringMaterials[1]);
    ring2.rotation.y = Math.PI / 4;
    coreGroup.add(ring2);

    const ring3Geo = new THREE.TorusGeometry(2.35, 0.025, 24, 120);
    const ring3 = new THREE.Mesh(ring3Geo, ringMaterials[2]);
    ring3.rotation.z = Math.PI / 6;
    coreGroup.add(ring3);

    // 4c. Partikel Beacon Mengorbit (Satelit Energi)
    const satGeo = new THREE.SphereGeometry(0.07, 16, 16);
    const satellites = [];
    const satColors = [0x00f2fe, 0xec4899, 0xa855f7];

    for (let i = 0; i < 3; i++) {
      const satMat = new THREE.MeshBasicMaterial({ color: satColors[i] });
      const sat = new THREE.Mesh(satGeo, satMat);
      coreGroup.add(sat);
      satellites.push({ mesh: sat, radius: 1.6 + i * 0.4, speed: 1.2 + i * 0.4, offset: (i * Math.PI * 2) / 3 });
    }

    // 5. Partikel Spiral Galaksi (1.500 Butir Debu Kosmis Berwarna)
    const particleCount = 1500;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleColors = new Float32Array(particleCount * 3);

    const cCyan = new THREE.Color(0x06b6d4);
    const cPurple = new THREE.Color(0x8b5cf6);
    const cPink = new THREE.Color(0xf43f5e);

    for (let i = 0; i < particleCount; i++) {
      const radius = 1.5 + Math.random() * 12;
      const angle = Math.random() * Math.PI * 2;
      const spreadY = (Math.random() - 0.5) * 4.5;

      particlePos[i * 3] = Math.cos(angle) * radius;
      particlePos[i * 3 + 1] = spreadY;
      particlePos[i * 3 + 2] = Math.sin(angle) * radius;

      const mixedColor = i % 3 === 0 ? cCyan : (i % 3 === 1 ? cPurple : cPink);
      particleColors[i * 3] = mixedColor.r;
      particleColors[i * 3 + 1] = mixedColor.g;
      particleColors[i * 3 + 2] = mixedColor.b;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(particleColors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.045,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    const particleCloud = new THREE.Points(particleGeo, particleMat);
    scene.add(particleCloud);

    // 6. Interaksi Mouse Parallax (Kamera Mengikuti Gerakan Kursor)
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 7. Loop Animasi 60 FPS
    let animationFrameId;
    let clock = new THREE.Clock();

    function animate() {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Rotasi cincin gyroscope orbital
      ring1.rotation.x += 0.012;
      ring1.rotation.y += 0.008;

      ring2.rotation.y += 0.015;
      ring2.rotation.z += 0.006;

      ring3.rotation.z += 0.01;
      ring3.rotation.x += 0.014;

      // Rotasi dan denyutan inti dalam
      innerCore.rotation.y -= 0.018;
      innerCore.rotation.x += 0.009;
      crystalMesh.rotation.y += 0.025;

      const pulse = 1 + Math.sin(elapsedTime * 2.5) * 0.08;
      innerCore.scale.set(pulse, pulse, pulse);
      innerMat.emissiveIntensity = 1.8 + Math.sin(elapsedTime * 3) * 0.8;

      // Satelit mengorbit
      satellites.forEach((sat) => {
        const theta = elapsedTime * sat.speed + sat.offset;
        sat.mesh.position.set(
          Math.cos(theta) * sat.radius,
          Math.sin(theta * 1.5) * (sat.radius * 0.4),
          Math.sin(theta) * sat.radius
        );
      });

      // Rotasi partikel vortex
      particleCloud.rotation.y = elapsedTime * 0.04;
      particleCloud.rotation.x = Math.sin(elapsedTime * 0.1) * 0.08;

      // Lampu bergerak dinamis
      cyanLight.position.x = Math.sin(elapsedTime * 0.8) * 4;
      cyanLight.position.y = Math.cos(elapsedTime * 0.6) * 3;
      pinkLight.position.x = -Math.sin(elapsedTime * 0.8) * 4;
      pinkLight.position.z = Math.cos(elapsedTime * 0.7) * 3;

      // Interpolasi Parallax Halus mengikuti mouse
      targetX += (mouseX * 0.8 - targetX) * 0.05;
      targetY += (mouseY * 0.6 - targetY) * 0.05;

      coreGroup.rotation.y = targetX * 0.7;
      coreGroup.rotation.x = -targetY * 0.5;
      camera.position.x = targetX * 0.6;
      camera.position.y = targetY * 0.4;
      camera.lookAt(0, 0, 0);

      renderer.render(scene, camera);
    }

    animate();

    // 8. Handle Resize Window
    const handleResize = () => {
      if (!container) return;
      const newW = container.clientWidth || window.innerWidth;
      const newH = container.clientHeight || window.innerHeight;
      camera.aspect = newW / newH;
      camera.updateProjectionMatrix();
      renderer.setSize(newW, newH);
    };
    window.addEventListener('resize', handleResize);

    // 9. Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      innerGeo.dispose();
      innerMat.dispose();
      crystalGeo.dispose();
      crystalMat.dispose();
      ring1Geo.dispose();
      ring2Geo.dispose();
      ring3Geo.dispose();
      ringMaterials.forEach(m => m.dispose());
      satGeo.dispose();
      particleGeo.dispose();
      particleMat.dispose();
    };
  }, []);

  // Event listener tombol Enter & Spasi agar user bisa langsung masuk dengan keyboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        onEnter();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onEnter]);

  return (
    <div className="relative h-screen w-screen overflow-hidden flex flex-col justify-between items-center bg-[#050814] text-white select-none">
      
      {/* 3D Three.js Interactive Canvas Container */}
      <div className="absolute inset-0 z-0">
        <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing" />
        
        {/* Glow Spheres di Belakang untuk Nuansa Sinematik */}
        <div className="absolute top-1/4 left-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-cyan-500/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-72 sm:w-96 h-72 sm:h-96 bg-pink-500/15 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 sm:w-[500px] h-80 sm:h-[500px] bg-purple-600/10 rounded-full blur-[130px] pointer-events-none" />
      </div>

      {/* 1. Header / Top Branding */}
      <header className="relative z-10 w-full pt-8 sm:pt-12 px-4 flex flex-col items-center text-center pointer-events-none">
        
        {/* Badge Pill Shimmer */}
        <div className="inline-flex items-center gap-2 px-3.5 sm:px-4 py-1.5 rounded-full bg-surface-container/70 border border-cyan-500/30 backdrop-blur-xl shadow-lg shadow-cyan-500/10 mb-4 animate-fadeIn">
          <Sparkles className="w-4 h-4 text-cyan-400 animate-spin-slow" />
          <span className="text-[10px] sm:text-xs font-bold tracking-wider text-cyan-300 uppercase">
            NEXT-GEN MEDIA DOWNLOADER
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        </div>

        {/* Grand Title */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-none text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-indigo-200 to-pink-400 drop-shadow-[0_0_35px_rgba(139,92,246,0.35)] animate-fadeIn">
          Kuro Studio
        </h1>

        {/* Subheading */}
        <p className="max-w-xl text-xs sm:text-sm md:text-base text-on-surface-variant/80 mt-3 sm:mt-4 leading-relaxed px-4 animate-fadeIn">
          Ekstrak video tanpa watermark, foto album HD, dan audio MP3 dari TikTok, Instagram, X (Twitter), dan YouTube dalam hitungan detik.
        </p>

      </header>

      {/* 2. Middle Spacer (Fokus pada Hologram 3D Cyber Core) */}
      <div className="relative z-10 pointer-events-none my-auto" />

      {/* 3. Bottom Platform Badges & Magnetic CTA */}
      <footer className="relative z-10 w-full pb-8 sm:pb-12 px-4 flex flex-col items-center gap-5 sm:gap-6">
        
        {/* Platform Chips Floating Bar */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 max-w-2xl px-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container/50 border border-white/10 backdrop-blur-md text-[11px] sm:text-xs text-on-surface-variant shadow-sm">
            <Music2 className="w-3.5 h-3.5 text-pink-400" />
            <span>TikTok No-WM & Slide</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container/50 border border-white/10 backdrop-blur-md text-[11px] sm:text-xs text-on-surface-variant shadow-sm">
            <Camera className="w-3.5 h-3.5 text-purple-400" />
            <span>Instagram Reels & Carousel</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container/50 border border-white/10 backdrop-blur-md text-[11px] sm:text-xs text-on-surface-variant shadow-sm">
            <span className="font-bold text-xs text-white">𝕏</span>
            <span>X Video & Master Foto</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container/50 border border-white/10 backdrop-blur-md text-[11px] sm:text-xs text-on-surface-variant shadow-sm">
            <Play className="w-3.5 h-3.5 text-red-400" />
            <span>YouTube Shorts & MP3</span>
          </div>
        </div>

        {/* Primary CTA Button with Glow Effect */}
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={onEnter}
            className="group relative px-8 sm:px-10 py-4 sm:py-4.5 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-pink-500 text-white font-extrabold text-base sm:text-lg md:text-xl shadow-2xl glow-button hover:scale-105 active:scale-95 transition-all duration-300 flex items-center gap-3 cursor-pointer overflow-hidden border border-white/20"
          >
            {/* Shimmer light sweep on hover */}
            <div className="absolute inset-0 w-1/2 h-full bg-white/20 skew-x-12 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-700 ease-out pointer-events-none" />
            
            <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-200" />
            <span>Mulai Download Sekarang</span>
            <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-1.5 transition-transform" />
          </button>

          {/* Shortcut hint */}
          <div className="flex items-center gap-2 text-[11px] sm:text-xs text-on-surface-variant/60">
            <span>Tekan tombol</span>
            <kbd className="px-2 py-0.5 rounded bg-surface-container border border-outline-variant/30 text-white font-mono text-[10px]">
              Enter ↵
            </kbd>
            <span>untuk langsung masuk</span>
          </div>
        </div>

      </footer>

    </div>
  );
}
