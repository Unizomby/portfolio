import streamlit as st
import pandas as pd
import plotly.express as px
from streamlit_drawable_canvas import st_canvas

# ── 1) Page setup ──
st.set_page_config(layout="wide")
st.title("🏭 Factory Flow Simulator with Parallel Flows")

# ── 2) Stations & processing times ──
all_stations = ["Cutting", "Milling", "Assembly", "Inspection", "Packing"]
stations = st.sidebar.multiselect(
    "Choose stations to place", all_stations, default=all_stations
)
station_times = {
    s: st.sidebar.number_input(f"Time at {s} (sec)", min_value=1, value=2, key=f"time_{s}")
    for s in stations
}

# ── 3) Canvas & legend colors ──
palette = [
    "rgba(255, 99, 71, 0.5)",    # tomato
    "rgba(30, 144, 255, 0.5)",   # dodgerblue
    "rgba(34, 139, 34, 0.5)",    # forestgreen
    "rgba(255, 215, 0, 0.5)",    # gold
    "rgba(138, 43, 226, 0.5)",   # blueviolet
]
fill_mapping     = {s: palette[i % len(palette)] for i, s in enumerate(stations)}
fill_to_station  = {v: k for k, v in fill_mapping.items()}

st.sidebar.markdown("### Legend")
for s, fill in fill_mapping.items():
    st.sidebar.markdown(
        f"<span style='display:inline-block;width:20px;height:20px;"
        f"background:{fill};margin-right:8px;'></span>{s}",
        unsafe_allow_html=True
    )

# ── 4) Canvas drawing ──
def make_initial_drawing(stations):
    objs = []
    x0, y0, dx = 50, 50, 150
    for i, s in enumerate(stations):
        objs.append({
            "type": "rect",
            "left": x0 + i*dx, "top": y0,
            "width": 120, "height": 60,
            "stroke": "#333", "strokeWidth": 2,
            "fill": fill_mapping[s],
            "metadata": {"station": s},
        })
    return {"objects": objs}

canvas = st_canvas(
    background_color="#EEE",
    width=800, height=300,
    drawing_mode="transform",
    initial_drawing=make_initial_drawing(stations),
    key="canvas",
)

# ── 5) Read back X‐positions ──
station_positions = {}
if canvas.json_data and "objects" in canvas.json_data:
    for o in canvas.json_data["objects"]:
        if o["type"] == "rect":
            s = fill_to_station[o["fill"]]
            station_positions[s] = o["left"]

if not station_positions:
    # fallback to original index order
    station_positions = {s: i for i, s in enumerate(stations)}

st.sidebar.markdown("### Station X-Positions")
st.sidebar.write(station_positions)

# ── 6) Define parallel flows ──
n_flows = st.sidebar.number_input("How many flows?", min_value=1, max_value=5, value=2)
flows = []
for idx in range(n_flows):
    name   = st.sidebar.text_input(f"Flow {idx+1} Name", f"Flow {idx+1}", key=f"name_{idx}")
    chosen = st.sidebar.multiselect(
        f"Stations in {name}", stations, default=stations, key=f"flow_{idx}"
    )
    parts  = st.sidebar.number_input(f"Parts in {name}", min_value=1, value=3, key=f"parts_{idx}")
    # if they left it unchanged, apply canvas order
    if set(chosen) == set(stations):
        chosen = [s for s,_ in sorted(station_positions.items(), key=lambda kv: kv[1])]
    flows.append({"name": name, "stations": chosen, "parts": parts})

# ── 7) Simulate ──
if st.sidebar.button("Run Simulation"):
    timeline = []
    # for each flow, t resets once per flow
    for flow in flows:
        t = 0
        for p in range(1, flow["parts"] + 1):
            for s in flow["stations"]:
                dur = station_times[s]
                timeline.append({
                    "Part":    f"{flow['name']}-{p}",
                    "Station": s,
                    "Start":   t,
                    "Finish":  t + dur
                })
                t += dur

    df = pd.DataFrame(timeline)
    df["Start_dt"]  = pd.to_datetime(df["Start"],  unit="s")
    df["Finish_dt"] = pd.to_datetime(df["Finish"], unit="s")

    # — Correct average cycle time calculation —
    # compute each flow’s cycle (sum of its station times)
    flow_cycles = [
        sum(station_times[s] for s in flow["stations"])
        for flow in flows
    ]
    avg_cycle = sum(flow_cycles) / len(flow_cycles)

    # maximum makespan
    max_time = df["Finish"].max()

    # display metrics
    c1, c2 = st.columns(2)
    c1.metric("Makespan (s)", f"{int(max_time)}")
    c2.metric("Avg Cycle Time (s)", f"{avg_cycle:.2f}")

    # — Gantt chart with shared colors —
    fig = px.timeline(
        df,
        x_start="Start_dt", x_end="Finish_dt",
        y="Part", color="Station",
        color_discrete_map=fill_mapping,
        title="Factory Flow Gantt (Parallel Streams)"
    )
    fig.update_yaxes(autorange="reversed")
    st.plotly_chart(fig, use_container_width=True)

else:
    st.write("🔹 Drag & drop your station boxes, define your flows, then click **Run Simulation**.")