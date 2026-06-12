# Role and Workflow Model

Roles are responsibilities that can be assigned to any team member. An agent can hold many roles, and a role can belong to many agents.

Workflow steps specify required roles rather than fixed agents. WorkflowRunner resolves each step to an enabled role holder, respecting preferred agents or providers when present. If no required role holder exists, the step is blocked unless optional.

Built-in workflows cover planning, review, coding, security audit, test review, documentation, claim verification, roundtable, and full build cycles.
