# Current UI — real-browser walkthrough

These are actual 1440×900 browser captures of the current UI branch with the
built-in mechanical PDF. They are not mockups or generated images. The displayed
schedule data comes from the existing extraction pipeline. No simulated Agent
answers or seeded proposals appear in these four screenshots.

## 1. Plans

Open a drawing and use the labeled Plans, Schedules, Agent, Takeoff and Report
destinations. The compact toolbar keeps drawing tools and scale accessible;
condition properties open on demand.

![Plans](ui-workspace/walkthrough/01-plans.png)

## 2. Schedules alongside the drawing

Choose Schedules, filter by sheet or kind, and select a schedule in the left
navigator. The detail grid retains the original headers and cells. View or a
row/tag link uses the existing source-highlight path.

![Schedules split view](ui-workspace/walkthrough/02-schedules.png)

## 3. Expand a wide schedule

Expand gives the table the main workspace. Wide columns scroll inside the grid.
Split view restores the drawing alongside it; source navigation also reveals
the drawing. This example shows the real diffuser and fan schedules.

![Expanded schedules](ui-workspace/walkthrough/03-expanded-schedules.png)

## 4. Ask Agent

Agent is a labeled primary destination with a persistent composer. Starter
prompts fill the draft; they do not run or commit anything automatically.
Answers and sources stay here, structured output opens in Takeoff, and proposed
marks retain the existing explicit review gate.

![Agent empty state](ui-workspace/walkthrough/04-agent.png)

This walkthrough demonstrates the UI, not a claim that a live takeoff has
passed. Live-model workflow results are documented separately from these views.

## 5. Read a dense answer

The following are browser captures of the updated answer renderer replaying
the five real recorded answer rows from the table19 live run. This is a
presentation test, not a fresh model run or a claim of perfect transcription.
Each row expands into its original 35 label/value pairs. All 175 pairs are
checked against the recorded response; the extraction engine is unchanged.

![Recorded answer rows, collapsed](ui-workspace/evidence/answer-readability/answer-overview.png)

![Recorded answer row, expanded](ui-workspace/evidence/answer-readability/answer-details.png)
