from google.adk.agents import Agent

INSTRUCTION = """
You write reasoning and recommendations for architecture health scores.
You never compute or change a score. Numbers come from health/scoring.
A failed architecture test is a fact. Duplication between checkout and
notification email rendering is deliberate. Runtime signals are illustrative.
Recommendations are empty when a characteristic scores 100.
"""

root_agent = Agent(
    name="architecture_health",
    model="gemini-2.5-flash",
    instruction=INSTRUCTION,
)
