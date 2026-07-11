\# SnowCraft Remake Technical Design Document

\*\*Project:\*\* SnowCraft (1999 Flash Game) Recreation  

\*\*Engine:\*\* Three.js  

\*\*Language:\*\* TypeScript  

\*\*Bundler:\*\* Vite  

\*\*Platform:\*\* Modern Desktop Browsers  

\*\*Rendering:\*\* WebGL (Three.js)  

\*\*Architecture:\*\* Data-Oriented / ECS-inspired Modular Systems



\---



\# 1. Project Goal



Recreate the classic 1999 Flash game \*\*SnowCraft\*\* as faithfully as possible while using modern web technologies and clean software architecture.



The objective is \*\*gameplay accuracy first\*\*, not visual modernization.



Players should immediately recognize the original game's feel:



\- Mouse-controlled squad

\- Snowball combat

\- Simple AI

\- Cartoon visuals

\- Fast-paced tactical gameplay

\- Easy to understand, difficult to master



The remake should remain faithful while being architected so future improvements (multiplayer, additional maps, new game modes) are easy to implement.



\---



\# 2. Core Gameplay



The player controls \*\*three children\*\* in a snowball fight against an opposing AI team.



Each unit can:



\- Move

\- Throw snowballs

\- Take cover

\- Be stunned when hit

\- Be eliminated after sufficient damage



The battlefield contains obstacles that affect movement and line of sight.



Victory occurs when every enemy player is eliminated.



\---



\# 3. Gameplay Pillars



The remake should preserve these pillars.



\## 1. Positioning



Winning depends on positioning more than aiming.



Movement should feel responsive.



Cover should matter.



\---



\## 2. Projectile Combat



Snowballs:



\- travel over time

\- require aiming

\- can miss

\- can be dodged



Combat is intentionally imperfect.



\---



\## 3. Squad Management



The player is commanding a small team.



Not a single character.



Controls should encourage quick repositioning.



\---



\## 4. Simple but Smart AI



AI should appear intelligent without requiring complex planning.



Desired behaviors:



\- seek cover

\- attack exposed enemies

\- retreat when weak

\- avoid clustering

\- dodge incoming snowballs



\---



\# 4. Camera



Use an orthographic camera.



Slight downward angle similar to the Flash original.



Camera remains fixed.



No rotation.



No zoom (initially).



Arena always fits comfortably on screen.



\---



\# 5. Coordinate System



Gameplay uses world-space coordinates.



Avoid tile-based movement.



Instead:



```

position = Vector2



velocity = Vector2



direction = normalized Vector2

```



Rendering converts gameplay coordinates into Three.js world coordinates.



\---



\# 6. Arena



Arena consists of:



\- snow ground

\- trees

\- rocks

\- snow forts

\- fences

\- decorative props



Gameplay objects occupy collision volumes.



Rendering meshes are independent.



Arena should load from JSON.



Example:



```json

{

&#x20; "width": 40,

&#x20; "height": 30,

&#x20; "objects": \[

&#x20;   {

&#x20;     "type": "tree",

&#x20;     "x": 12,

&#x20;     "y": 8

&#x20;   }

&#x20; ]

}

```



\---



\# 7. Game Objects



Every gameplay object consists only of simulation data.



Example:



```ts

interface Entity {

&#x20;   id: number;

&#x20;   position: Vector2;

}

```



Never inherit from Three.Object3D.



\---



\# 8. Rendering



Three.js is only responsible for visuals.



Gameplay must never query meshes.



Rendering observes game state.



Architecture:



Simulation



↓



Renderer



↓



Three.js Scene



\---



\# 9. Player Data



Each player stores:



```ts

id



team



position



velocity



rotation



health



state



moveTarget



throwCooldown



currentAnimation



selected



alive

```



\---



\# 10. Player States



Finite State Machine.



```

Idle



Moving



PreparingThrow



Throwing



Recovering



Hit



Frozen



Defeated

```



Transitions must be explicit.



\---



\# 11. Controls



Mouse only.



\### Selection



Click player.



Shift-click multiple.



Drag rectangle for selection.



\---



\### Movement



Right-click destination.



Selected players move independently while maintaining slight spacing.



\---



\### Throwing



Hold left mouse.



Power meter increases.



Release.



Snowball launches.



Trajectory preview optional.



\---



\# 12. Snowball Physics



Projectile uses real ballistic motion.



Simulation:



```

position



velocity



gravity

```



Each frame:



```

velocity.y -= gravity



position += velocity

```



Projectile collides with:



\- players

\- trees

\- rocks

\- forts



Snowballs disappear after collision.



\---



\# 13. Damage



Every hit applies:



```

damage



brief stun



knockback

```



After enough hits:



Player defeated.



\---



\# 14. Cover System



Objects provide cover.



Cover blocks:



\- snowballs

\- line of sight



Each obstacle has:



```

collision volume



cover volume

```



Players should naturally hide behind objects.



\---



\# 15. AI



AI consists of layered behaviors.



Priority:



```

Avoid danger



Find cover



Attack nearest target



Support teammates



Wander

```



Avoid behavior trees initially.



Use utility scoring.



Example:



```

score\_attack =



distance



visibility



enemy health



cover



cooldown

```



Highest score wins.



\---



\# 16. Pathfinding



Initially:



Simple steering.



Obstacle avoidance.



Later:



Navigation mesh.



or



Flow field.



Avoid A\* until necessary.



\---



\# 17. Collision



Use simple primitives.



Circle



Rectangle



Capsule



Never use mesh collision.



Broadphase:



Spatial Hash Grid.



Narrowphase:



Primitive intersections.



\---



\# 18. Animation



Simple skeletal animation is unnecessary.



Use transform animation.



Examples:



Idle bounce



Walk bob



Throw windup



Hit reaction



Victory dance



\---



\# 19. Effects



Particle effects:



Snow puff



Snowball trail



Hit burst



Footprints



Sparkles



Particles should be pooled.



No allocations during gameplay.



\---



\# 20. Audio



Manager owns:



Music



Effects



Ambient sounds



Future positional audio.



Use Web Audio API.



\---



\# 21. User Interface



Menus:



Main Menu



Pause



Victory



Defeat



HUD:



Health



Selected players



Cooldown indicator



FPS (debug)



\---



\# 22. Asset Pipeline



Folder structure:



```

assets/



models/



textures/



audio/



maps/



ui/

```



Assets loaded asynchronously.



Central AssetManager.



\---



\# 23. Input System



Raw input converted into commands.



Example:



```

SelectUnits



MoveUnits



ThrowSnowball



PauseGame

```



Gameplay never queries keyboard/mouse directly.



\---



\# 24. Event System



Loose coupling.



Example events:



```

PlayerHit



PlayerDefeated



SnowballThrown



RoundStarted



RoundEnded

```



Systems subscribe.



Avoid direct references.



\---



\# 25. Update Order



Fixed timestep.



```

Input



↓



AI



↓



Movement



↓



Pathfinding



↓



Projectile Physics



↓



Collision



↓



Damage



↓



Animation State



↓



Rendering

```



Simulation:



60 Hz



Rendering:



Unlimited FPS.



\---



\# 26. Performance Goals



Target:



\- 6 players

\- 50+ projectiles

\- 500 particles

\- 144 FPS rendering

\- 60 Hz simulation



Avoid:



Temporary allocations.



Garbage collection spikes.



Repeated object creation.



Pool:



Snowballs



Particles



Temporary vectors



\---



\# 27. Debug Tools



Developer overlay:



Collision shapes



AI targets



Pathfinding



FPS



Frame time



Projectile paths



Selection radius



Hitboxes



Toggle individually.



\---



\# 28. Save Format



Future-proof JSON.



```

Map



Player positions



Scores



Settings

```



\---



\# 29. Code Standards



Strict TypeScript.



No `any`.



Prefer:



Interfaces



Composition



Dependency Injection



Pure functions



Small files



One responsibility per class.



\---



\# 30. Folder Structure



```

src/



core/



Game.ts

GameLoop.ts



engine/



Renderer.ts

InputManager.ts

AudioManager.ts

AssetManager.ts

CameraController.ts



ecs/



Entity.ts

Component.ts

System.ts



game/



Player.ts

Snowball.ts

Arena.ts

Obstacle.ts

MapLoader.ts



systems/



MovementSystem.ts

AISystem.ts

ProjectileSystem.ts

CollisionSystem.ts

AnimationSystem.ts

RenderSyncSystem.ts



physics/



Collision.ts

SpatialHash.ts



render/



PlayerRenderer.ts

ArenaRenderer.ts

ParticleRenderer.ts



ui/



HUD.ts

Menus.ts



assets/



maps/



textures/



models/



audio/



utils/

```



\---



\# 31. Milestones



\## Milestone 1



\- Vite project

\- Three.js renderer

\- Camera

\- Arena

\- Asset loading



\---



\## Milestone 2



\- Player entities

\- Mouse selection

\- Movement



\---



\## Milestone 3



\- Snowball throwing

\- Projectile physics

\- Hit detection



\---



\## Milestone 4



\- Obstacles

\- Cover

\- Collision



\---



\## Milestone 5



\- AI

\- Enemy behavior

\- Win/Loss conditions



\---



\## Milestone 6



\- Animations

\- Particles

\- Audio

\- Polish



\---



\## Milestone 7



\- Additional maps

\- Improved AI

\- Better effects

\- Save settings



\---



\# 32. Future Enhancements



The architecture should support future additions without major refactoring:



\- Local multiplayer

\- Online multiplayer

\- Co-op modes

\- New maps

\- Map editor

\- Replay system

\- Deterministic lockstep networking

\- Mobile controls

\- Additional unit types

\- Power-ups

\- Destructible cover

\- Seasonal visual themes



\---



\# 33. Definition of Done



The remake is considered complete when:



\- Gameplay faithfully matches the pacing and feel of the original SnowCraft.

\- Controls are responsive and intuitive.

\- AI provides a fun and believable challenge.

\- Rendering consistently exceeds 60 FPS on typical desktop hardware.

\- The codebase is modular, documented, and easy to extend.

\- All gameplay logic is decoupled from rendering, enabling future features such as multiplayer and alternate renderers with minimal architectural changes.

