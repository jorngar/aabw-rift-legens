Instead of pitching an indie game for entertainment, this version uses the game client as a high-fidelity data-generation canvas and positions the backend as an Autonomous LiveOps & Robotics Dataset Infrastructure Engine built entirely on AWS AgentCore.

# Project Pitch

## Title
SimForge: Rift Legends

## Tagline
Autonomous LiveOps & Embodied AI Data Harvesting via Gamified Human Demonstration.

---

## 1. Core Concept & The Unified Dual-Value Loop

**SimForge: Rift Legends** is a mobile isometric action-RPG that serves as a Trojan Horse for enterprise data pipelines. While players engage in immersive, high-velocity, Diablo-style combat inside a military academy context (*The Garden*), the entire gameplay loop is secretly an optimized pipeline for two distinct AWS-backed enterprise engines:

- **Autonomous Game LiveOps:** Tracking real-time player telemetry to let AI agents autonomously balance games, run A/B traffic tests, and diagnose post-patch bugs.
- **Physical World Data Layer (Embodied AI):** Capturing raw human spatial navigation vectors, collision-avoidance paths, and manipulation traces to compile high-value Imitation Learning and Teleoperation datasets used to train real-world robots.

---

## 2. The Big Innovation: The Legend Pipeline & Spatial Data Harvest

Most AI gaming concepts call expensive APIs every time an NPC speaks, which causes operational costs to skyrocket. We use **Amazon Bedrock AgentCore** to run a dual-layer temporal system that simultaneously drives game content and harvests robotics data:

### Layer A: The Founding Captains (Paid / Live Spatial Demonstration)
- Premium players function as *"Captains"* running live, unmapped Rift portals. Their instances pull real-time LLM storytelling configs from Amazon Bedrock (using the Amazon Nova / Anthropic Claude models).
- As they play, their high-fidelity input streams (exact 2D trajectory arrays, velocity vectors, evasion choices around obstructions) are captured.

### Layer B: The Guild Operators (Free / Scalable Replay & Data Validation)
- Free players (*"Operators"*) do not make expensive, live AI API calls. Instead, they replay the historical memory of the Captain's run as hardcoded legend content (*"I remember when the Captain first entered the Dragon Mountains..."*).
- When thousands of free players run this historical path, their gameplay acts as a massive data-validation engine, reinforcing or refining the optimal pathing model originally laid down by the Captain.

---

## 3. One-Sentence Pitch

> SimForge: Rift Legends uses Amazon Bedrock AgentCore to run an autonomous LiveOps game engine that simultaneously transforms real-time human player trajectories into structured physical-world datasets for robotics training.

---

## 4. The Enterprise Problems We Solve

- **The Game LiveOps Bottleneck:** Traditional games take months of manual data engineering to balance weapons, diagnose post-patch bugs, and interpret player A/B test splits.
- **The Robotics Data Scarcity Crisis:** Training embodied AI requires millions of hours of expensive real-world physical robot data or human VR teleoperation.
- **The AI Compute Variable Cost Problem:** Scaling generative AI directly to a massive free-to-play player base creates unpredictable, bleeding API cost lines.

---

## 5. The AWS Infrastructure Solution

Instead of raw, unmetered API endpoints, we leverage the **AWS AgentCore CLI and Runtime** to manage a multi-agent backend that scales predictably like cloud compute:

```
                  ┌────────────────────────────────────────┐
                  │          Pixi.js Client Game           │
                  │   (Captures Spatial Traces & Clicks)   │
                  └───────────────────┬────────────────────┘
                                      │ Streams Telemetry
                                      ▼
                  ┌────────────────────────────────────────┐
                  │           AgentCore Gateway            │
                  └─────────┬────────────────────┬─────────┘
                            │                    │
        ┌───────────────────┘                    └───────────────────┐
        ▼                                                            ▼
┌──────────────────────────────┐              ┌──────────────────────────────┐
│     The LiveOps Agent        │              │     The Data Forge Agent     │
│   (Telemetry & A/B Testing)  │              │   (Physical World Dataset)   │
│ Ingests player telemetry via │              │ Transforms game coordinate   │
│ AWS Lambda to adjust boss    │              │ paths into standard robotic  │
│ health & run traffic splits. │              │ trajectory files in AWS S3.  │
└──────────────────────────────┘              └──────────────────────────────┘
```

- **Data Ingestion:** Game telemetry is continuously emitted from the Pixi.js client and ingested through the AgentCore Gateway, load-balancing requests via serverless AWS Lambda functions.
- **The LiveOps Agent:** Evaluates game win/loss states, instantly designs and deploys live, runtime weapon balance sheets, and monitors traffic variations.
- **The Data Forge Agent:** Strips the "fantasy game" wrapper away from the coordinates, translates dungeon geometry into absolute physical collision boundaries, and formats human trajectory paths into standardized robotic training arrays stored inside an Amazon S3 Data Lake.

---

## 6. Token/Compute Budget Model

Through the **AgentCore Policy Engine** (guarded by Cedar), AI resources are hard-capped:

- **Paid Captains** receive a monthly AI Story/Telemetry Credit Allocation. If exhausted, their runtime shifts to deterministic cached behaviors, maintaining clear margins.
- **Operators** consume strictly static JSON records served directly from Amazon DynamoDB/SQLite, meaning free-player scaling introduces zero marginal AI token costs.

---

## 7. The 5-Minute Judge Demo Flow (AWS Showcase Focus)

- **0:00–0:30 — The Hook:** Show the game, but frame it immediately as an enterprise system: *"Judges, we are using Amazon Bedrock AgentCore to completely automate mobile game live-ops while simultaneously harvesting human spatial data to train real-world robots."*
- **0:30–1:30 — Live Telemetry Generation:** Boot the Pixi.js client in Captain Mode. Play through an isometric dungeon room. On a side-by-side debug console, show the raw coordinate stream $(x, y, v, t)$ pumping into the AgentCore Gateway.
- **1:30–2:30 — The Autonomous LiveOps Loop:** Simulate an un-balanced gameplay state (e.g., player dies repeatedly). Watch the LiveOps Agent catch the telemetry spike, query Amazon Bedrock (Claude/Nova), validate it against Bedrock Guardrails, and automatically patch the boss's attributes in the database with zero human engineering.
- **2:30–4:00 — The Robotics Data Layer Freeze:** Complete the dungeon and trigger a story choice. Show the Data Forge Agent freezing the match data. The UI instantly reveals the enterprise asset generated: a beautifully structured, normalized robotic training JSON matrix written directly into an Amazon S3 bucket.
- **4:00–5:00 — The Operator Retrofit & Close:** Switch the client to Operator Mode. Show the free player replaying the exact map, reading the cached legend dialogue. Prove that the system requires zero compute overhead for free users while leveraging their actions to further refine the spatial navigation data.

---

## 8. Revised Core Technical Schemas (AWS-Native)

### The Telemetry Payload (Client ➔ AgentCore Gateway)

```json
{
  "session_id": "session_cap_arlen_9921",
  "player_role": "Captain",
  "timestamp": 1782394385,
  "telemetry_type": "spatial_trajectory",
  "game_metrics": {
    "player_hp": 85,
    "current_weapon_id": "plasma_blade_v1",
    "damage_output_per_second": 142.5
  },
  "spatial_data": {
    "map_id": "dragon_mountain_zone_3",
    "player_position": {"x": 42.11, "y": 118.94},
    "velocity_vector": {"vx": 1.2, "vy": -0.8},
    "nearest_obstacle_distance": 2.4,
    "path_history_coordinates": [
      {"x": 40.0, "y": 120.0, "t": 0},
      {"x": 41.2, "y": 119.5, "t": 100},
      {"x": 42.1, "y": 118.9, "t": 200}
    ]
  }
}
```

### The Enterprise Data Asset Output (AgentCore ➔ Amazon S3 Data Lake)

```json
{
  "dataset_reference_id": "robot_trajectory_imitation_s3_001",
  "source_human_session": "session_cap_arlen_9921",
  "environment_mapping": {
    "domain": "spatial_navigation_obstacle_avoidance",
    "bounding_boxes_static_obstacles": [
      {"obstacle_type": "column_pillar", "center": {"x": 45.0, "y": 115.0}, "radius": 1.5}
    ],
    "surface_friction_coefficient": 0.85,
    "simulated_lux_lighting_level": 150
  },
  "robotic_training_arrays": {
    "demonstration_successful": true,
    "normalized_trajectories": [
      [0.0, 40.0, 120.0, 1.2, -0.8],
      [0.1, 41.2, 119.5, 1.2, -0.8],
      [0.2, 42.1, 118.4, 1.0, -0.5]
    ],
    "target_goal_coordinate": {"x": 60.0, "y": 100.0}
  }
}
```

---

## 9. Revised 5-Day Schedule Table (AWS-Focused)

| Day | Main Goal | Builder A (Game Client / Telemetry) | Builder B (AWS Infrastructure / Backend) | You (Product / AgentCore Architect / Pitch) |
|-----|-----------|--------------------------------------|-------------------------------------------|----------------------------------------------|
| Day 1 | Scaffold & Telemetry | Build Pixi.js canvas, joystick movement, coordinate logging scripts. | Initialize `agentcore create`. Configure local endpoints and connect to local storage. | Draft Data Forge Agent prompt templates; set up JSON schema architecture contracts. |
| Day 2 | LiveOps Loop | Add enemy states, attack tracking emitters, and dynamic variable listeners. | Connect client to AgentCore Gateway. Deploy telemetry streaming loops to AWS Lambdas. | Develop the Telemetry Balance Agent. Test automated balance alterations via `agentcore dev`. |
| Day 3 | Data Layer Freeze | Build the path visualization toggle and the post-boss choice interfaces. | Build the conversion layer storing game logs as hardcoded Legend records. | Configure Data Forge Agent pipeline to push raw spatial records into Amazon S3. |
| Day 4 | Pipeline Integration | Polish UI transitions, add error states, scale fake multiplayer telemetry logs. | Instrument AgentCore Observability metrics and implement Bedrock Guardrails. | Structure the business slide formulations, script recording backups, finalize presentation. |
| Day 5 | Showtime | Iron out graphics and runtime performance; export build hooks. | Validate full system resilience and clear live token budget monitors. | Conduct full dress rehearsals, optimize judge Q&A matrices, deliver the pitch. |

---

## 10. Ultimate Judge Q&A Answers (Revised)

**Q: How does this qualify for the AWS track beyond simple hosting?**

**Answer:** Our entire multi-agent coordination system is built natively inside the Amazon Bedrock AgentCore framework. We rely on the AgentCore Gateway to load-balance live data ingestion, AgentCore Policy Engine (Cedar) to apply strict guardrails on telemetry parsing, and our agents directly synthesize datasets and push them directly to an Amazon S3 Data Lake.

**Q: Why use a game to collect robotics data instead of a standard simulator like Gazebo?**

**Answer:** Gazebo and Isaac Sim are brilliant for programmatic physics execution, but they lack human intuition traces. By wrapping spatial problems inside a fun, accessible mobile game, we gamify the collection process, allowing thousands of human minds to provide imitation learning trajectories and edge-case resolutions for a tiny fraction of the cost of real-world robot teleoperation.
