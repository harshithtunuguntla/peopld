# Domain: AI (Intelligence)

## 1. Purpose
To act as the overarching Intelligence layer, transforming facts into actionable recommendations, insights, predictions, and automated assistance across the entire platform.

## 2. Responsibilities
*   **Matchmaking & Recommendations**: Suggesting people to meet or sessions to attend.
*   **Predictive Scoring**: Scoring leads for exhibitors or predicting attendee churn.
*   **Event Copilot**: Providing conversational interfaces for users to discover opportunities.
*   **Opportunity Discovery**: Mining the Event Memory graph to surface non-obvious business outcomes.
*   **Interpretation**: Analyzing factual data (from Analytics) to generate strategic insights.

## 3. Core Entities
*   **Model**: The deployed algorithm (e.g., Matchmaking V2).
*   **InferenceResult**: The computed output (e.g., a recommendation list).
*   **CopilotSession**: A conversational thread with the AI assistant.

## 4. Value Objects
*   `MatchScore` (0.0 to 1.0)
*   `Insight` (Textual interpretation of data)
*   `PromptTemplate`

## 5. Domain Events
*   `RecommendationGenerated`
*   `InsightPublished`
*   `CopilotActionTriggered`

## 6. Business Rules
*   AI inferences are probabilistic, not deterministic. UI must reflect this (e.g., "Suggested for you").
*   Models must respect the data isolation boundaries of `TenantOrganizations` unless cross-event consent is explicitly given via `Identity`.
*   AI must not directly mutate state in other domains without explicit user confirmation (e.g., the Copilot can draft a message, but the user must click send).

## 7. Relationships with other domains
*   **Analytics**: AI consumes factual metrics from Analytics to generate predictions and interpretations.
*   **Networking**: AI feeds `MatchScore`s into the Networking domain to drive the relationship graph.
*   **Exhibitors/Sponsors**: AI provides Lead Scoring.

## 8. Ownership Boundaries
*   **Owns**: The algorithms, the LLM integrations, embeddings, scoring logic, and interpretation of data.
*   **Does NOT Own**: The raw factual metrics (Analytics) or the final execution of the suggested action (e.g., sending the message).

## 9. Open Questions
*   How do we measure the ROI of the AI models themselves? (e.g., tracking the acceptance rate of recommendations).
*   Do we host our own open-source LLMs for privacy, or rely on external APIs (OpenAI/Anthropic)?

## 10. Future Considerations
*   Autonomous AI Agents that negotiate meeting times on behalf of users.
*   Real-time voice translation and conversational analytics during video sessions.
