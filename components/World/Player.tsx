/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../store';
import { LANE_WIDTH, GameStatus } from '../../types';
import { audio } from '../System/Audio';

// Physics Constants
const GRAVITY = 50;
const JUMP_FORCE = 16; // Results in ~2.56 height (v^2 / 2g)

// Static Geometries - Dog Body Parts
const BODY_GEO = new THREE.BoxGeometry(0.5, 0.4, 0.8); // Elongated body
const HEAD_GEO = new THREE.BoxGeometry(0.35, 0.3, 0.4); // Dog head
const SNOUT_GEO = new THREE.BoxGeometry(0.2, 0.15, 0.25); // Dog snout
const EAR_GEO = new THREE.BoxGeometry(0.15, 0.25, 0.05); // Dog ears
const LEG_GEO = new THREE.BoxGeometry(0.12, 0.5, 0.12); // Dog legs
const TAIL_GEO = new THREE.CylinderGeometry(0.05, 0.08, 0.6, 8); // Dog tail
const COLLAR_GEO = new THREE.TorusGeometry(0.2, 0.04, 8, 16); // Dog collar
const JOINT_SPHERE_GEO = new THREE.SphereGeometry(0.06);
const SHADOW_GEO = new THREE.CircleGeometry(0.5, 32);

export const Player: React.FC = () => {
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Group>(null);
  const shadowRef = useRef<THREE.Mesh>(null);

  // Limb Refs for Dog Animation
  const frontLeftLegRef = useRef<THREE.Group>(null);
  const frontRightLegRef = useRef<THREE.Group>(null);
  const backLeftLegRef = useRef<THREE.Group>(null);
  const backRightLegRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);

  const { status, laneCount, takeDamage, hasDoubleJump, activateImmortality, isImmortalityActive } = useStore();
  
  const [lane, setLane] = React.useState(0);
  const targetX = useRef(0);
  
  // Physics State (using Refs for immediate logic updates)
  const isJumping = useRef(false);
  const velocityY = useRef(0);
  const jumpsPerformed = useRef(0); 
  const spinRotation = useRef(0); // For double jump flip

  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const isInvincible = useRef(false);
  const lastDamageTime = useRef(0);

  // Memoized Materials
  const { armorMaterial, jointMaterial, glowMaterial, shadowMaterial } = useMemo(() => {
      const armorColor = isImmortalityActive ? '#ffd700' : '#00aaff';
      const glowColor = isImmortalityActive ? '#ffffff' : '#00ffff';
      
      return {
          armorMaterial: new THREE.MeshStandardMaterial({ color: armorColor, roughness: 0.3, metalness: 0.8 }),
          jointMaterial: new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.7, metalness: 0.5 }),
          glowMaterial: new THREE.MeshBasicMaterial({ color: glowColor }),
          shadowMaterial: new THREE.MeshBasicMaterial({ color: '#000000', opacity: 0.3, transparent: true })
      };
  }, [isImmortalityActive]); // Only recreate if immortality state changes (for color shift)

  // --- Reset State on Game Start ---
  useEffect(() => {
      if (status === GameStatus.PLAYING) {
          isJumping.current = false;
          jumpsPerformed.current = 0;
          velocityY.current = 0;
          spinRotation.current = 0;
          if (groupRef.current) groupRef.current.position.y = 0;
          if (bodyRef.current) bodyRef.current.rotation.x = 0;
      }
  }, [status]);
  
  // Safety: Clamp lane if laneCount changes (e.g. restart)
  useEffect(() => {
      const maxLane = Math.floor(laneCount / 2);
      if (Math.abs(lane) > maxLane) {
          setLane(l => Math.max(Math.min(l, maxLane), -maxLane));
      }
  }, [laneCount, lane]);

  // --- Controls (Keyboard & Touch) ---
  const triggerJump = () => {
    const maxJumps = hasDoubleJump ? 2 : 1;

    if (!isJumping.current) {
        // First Jump
        audio.playJump(false);
        isJumping.current = true;
        jumpsPerformed.current = 1;
        velocityY.current = JUMP_FORCE;
    } else if (jumpsPerformed.current < maxJumps) {
        // Double Jump (Mid-air)
        audio.playJump(true);
        jumpsPerformed.current += 1;
        velocityY.current = JUMP_FORCE; // Reset velocity upwards
        spinRotation.current = 0; // Start flip
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (status !== GameStatus.PLAYING) return;
      const maxLane = Math.floor(laneCount / 2);

      if (e.key === 'ArrowLeft') setLane(l => Math.max(l - 1, -maxLane));
      else if (e.key === 'ArrowRight') setLane(l => Math.min(l + 1, maxLane));
      else if (e.key === 'ArrowUp' || e.key === 'w') triggerJump();
      else if (e.key === ' ' || e.key === 'Enter') {
          activateImmortality();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, laneCount, hasDoubleJump, activateImmortality]);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
        if (status !== GameStatus.PLAYING) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX.current;
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;
        const maxLane = Math.floor(laneCount / 2);

        // Swipe Detection
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
             if (deltaX > 0) setLane(l => Math.min(l + 1, maxLane));
             else setLane(l => Math.max(l - 1, -maxLane));
        } else if (Math.abs(deltaY) > Math.abs(deltaX) && deltaY < -30) {
            triggerJump();
        } else if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) {
            activateImmortality();
        }
    };

    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
        window.removeEventListener('touchstart', handleTouchStart);
        window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [status, laneCount, hasDoubleJump, activateImmortality]);

  // --- Animation Loop ---
  useFrame((state, delta) => {
    if (!groupRef.current) return;
    if (status !== GameStatus.PLAYING && status !== GameStatus.SHOP) return;

    // 1. Horizontal Position
    targetX.current = lane * LANE_WIDTH;
    groupRef.current.position.x = THREE.MathUtils.lerp(
        groupRef.current.position.x, 
        targetX.current, 
        delta * 15 
    );

    // 2. Physics (Jump)
    if (isJumping.current) {
        // Apply Velocity
        groupRef.current.position.y += velocityY.current * delta;
        // Apply Gravity
        velocityY.current -= GRAVITY * delta;

        // Floor Collision
        if (groupRef.current.position.y <= 0) {
            groupRef.current.position.y = 0;
            isJumping.current = false;
            jumpsPerformed.current = 0;
            velocityY.current = 0;
            // Reset flip
            if (bodyRef.current) bodyRef.current.rotation.x = 0;
        }

        // Double Jump Flip
        if (jumpsPerformed.current === 2 && bodyRef.current) {
             // Rotate 360 degrees quickly
             spinRotation.current -= delta * 15;
             if (spinRotation.current < -Math.PI * 2) spinRotation.current = -Math.PI * 2;
             bodyRef.current.rotation.x = spinRotation.current;
        }
    }

    // Banking Rotation
    const xDiff = targetX.current - groupRef.current.position.x;
    groupRef.current.rotation.z = -xDiff * 0.2; 
    groupRef.current.rotation.x = isJumping.current ? 0.1 : 0.05; 

    // 3. Dog Skeletal Animation
    const time = state.clock.elapsedTime * 25;

    if (!isJumping.current) {
        // Running Cycle - Dog gallop
        if (frontLeftLegRef.current) frontLeftLegRef.current.rotation.x = Math.sin(time) * 0.8;
        if (frontRightLegRef.current) frontRightLegRef.current.rotation.x = Math.sin(time + Math.PI) * 0.8;
        if (backLeftLegRef.current) backLeftLegRef.current.rotation.x = Math.sin(time + Math.PI) * 0.8;
        if (backRightLegRef.current) backRightLegRef.current.rotation.x = Math.sin(time) * 0.8;

        // Tail wagging
        if (tailRef.current) tailRef.current.rotation.z = Math.sin(time * 1.5) * 0.3;

        if (bodyRef.current) bodyRef.current.position.y = 0.6 + Math.abs(Math.sin(time)) * 0.08;
    } else {
        // Jumping Pose - Dog extends legs
        const jumpPoseSpeed = delta * 10;
        if (frontLeftLegRef.current) frontLeftLegRef.current.rotation.x = THREE.MathUtils.lerp(frontLeftLegRef.current.rotation.x, -0.3, jumpPoseSpeed);
        if (frontRightLegRef.current) frontRightLegRef.current.rotation.x = THREE.MathUtils.lerp(frontRightLegRef.current.rotation.x, -0.3, jumpPoseSpeed);
        if (backLeftLegRef.current) backLeftLegRef.current.rotation.x = THREE.MathUtils.lerp(backLeftLegRef.current.rotation.x, 0.3, jumpPoseSpeed);
        if (backRightLegRef.current) backRightLegRef.current.rotation.x = THREE.MathUtils.lerp(backRightLegRef.current.rotation.x, 0.3, jumpPoseSpeed);

        // Tail straight back when jumping
        if (tailRef.current) tailRef.current.rotation.z = THREE.MathUtils.lerp(tailRef.current.rotation.z, 0, jumpPoseSpeed);

        // Only reset Y if not flipping
        if (bodyRef.current && jumpsPerformed.current !== 2) bodyRef.current.position.y = 0.6;
    }

    // 4. Dynamic Shadow
    if (shadowRef.current) {
        const height = groupRef.current.position.y;
        const scale = Math.max(0.2, 1 - (height / 2.5) * 0.5); // 2.5 is max jump height approx
        const runStretch = isJumping.current ? 1 : 1 + Math.abs(Math.sin(time)) * 0.3;

        shadowRef.current.scale.set(scale, scale, scale * runStretch);
        const material = shadowRef.current.material as THREE.MeshBasicMaterial;
        if (material && !Array.isArray(material)) {
            material.opacity = Math.max(0.1, 0.3 - (height / 2.5) * 0.2);
        }
    }

    // Invincibility / Immortality Effect
    const showFlicker = isInvincible.current || isImmortalityActive;
    if (showFlicker) {
        if (isInvincible.current) {
             if (Date.now() - lastDamageTime.current > 1500) {
                isInvincible.current = false;
                groupRef.current.visible = true;
             } else {
                groupRef.current.visible = Math.floor(Date.now() / 50) % 2 === 0;
             }
        } 
        if (isImmortalityActive) {
            groupRef.current.visible = true; 
        }
    } else {
        groupRef.current.visible = true;
    }
  });

  // Damage Handler
  useEffect(() => {
     const checkHit = (e: any) => {
        if (isInvincible.current || isImmortalityActive) return;
        audio.playDamage(); // Play damage sound
        takeDamage();
        isInvincible.current = true;
        lastDamageTime.current = Date.now();
     };
     window.addEventListener('player-hit', checkHit);
     return () => window.removeEventListener('player-hit', checkHit);
  }, [takeDamage, isImmortalityActive]);

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <group ref={bodyRef} position={[0, 0.6, 0]}>

        {/* Dog Body */}
        <mesh castShadow position={[0, 0, 0]} geometry={BODY_GEO} material={armorMaterial} />

        {/* Dog Head */}
        <group ref={headRef} position={[0, 0.15, 0.5]}>
            <mesh castShadow geometry={HEAD_GEO} material={armorMaterial} />

            {/* Snout */}
            <mesh castShadow position={[0, -0.05, 0.3]} geometry={SNOUT_GEO} material={armorMaterial} />

            {/* Ears */}
            <mesh castShadow position={[-0.15, 0.2, 0]} geometry={EAR_GEO} material={armorMaterial} rotation={[0, 0, -0.3]} />
            <mesh castShadow position={[0.15, 0.2, 0]} geometry={EAR_GEO} material={armorMaterial} rotation={[0, 0, 0.3]} />

            {/* Eyes (glowing) */}
            <mesh position={[-0.1, 0.05, 0.3]} geometry={JOINT_SPHERE_GEO} material={glowMaterial} scale={[0.6, 0.6, 0.6]} />
            <mesh position={[0.1, 0.05, 0.3]} geometry={JOINT_SPHERE_GEO} material={glowMaterial} scale={[0.6, 0.6, 0.6]} />
        </group>

        {/* Collar */}
        <mesh position={[0, 0.15, 0.35]} rotation={[Math.PI/2, 0, 0]} geometry={COLLAR_GEO} material={glowMaterial} />

        {/* Front Right Leg */}
        <group position={[0.15, -0.2, 0.25]}>
            <group ref={frontRightLegRef}>
                <mesh position={[0, -0.25, 0]} castShadow geometry={LEG_GEO} material={armorMaterial} />
                <mesh position={[0, -0.5, 0]} geometry={JOINT_SPHERE_GEO} material={glowMaterial} />
            </group>
        </group>

        {/* Front Left Leg */}
        <group position={[-0.15, -0.2, 0.25]}>
            <group ref={frontLeftLegRef}>
                <mesh position={[0, -0.25, 0]} castShadow geometry={LEG_GEO} material={armorMaterial} />
                <mesh position={[0, -0.5, 0]} geometry={JOINT_SPHERE_GEO} material={glowMaterial} />
            </group>
        </group>

        {/* Back Right Leg */}
        <group position={[0.15, -0.2, -0.25]}>
            <group ref={backRightLegRef}>
                <mesh position={[0, -0.25, 0]} castShadow geometry={LEG_GEO} material={armorMaterial} />
                <mesh position={[0, -0.5, 0]} geometry={JOINT_SPHERE_GEO} material={glowMaterial} />
            </group>
        </group>

        {/* Back Left Leg */}
        <group position={[-0.15, -0.2, -0.25]}>
            <group ref={backLeftLegRef}>
                <mesh position={[0, -0.25, 0]} castShadow geometry={LEG_GEO} material={armorMaterial} />
                <mesh position={[0, -0.5, 0]} geometry={JOINT_SPHERE_GEO} material={glowMaterial} />
            </group>
        </group>

        {/* Tail */}
        <group position={[0, 0.1, -0.5]}>
            <group ref={tailRef}>
                <mesh position={[0, 0, -0.3]} rotation={[Math.PI/4, 0, 0]} castShadow geometry={TAIL_GEO} material={armorMaterial} />
            </group>
        </group>
      </group>

      <mesh ref={shadowRef} position={[0, 0.02, 0]} rotation={[-Math.PI/2, 0, 0]} geometry={SHADOW_GEO} material={shadowMaterial} />
    </group>
  );
};