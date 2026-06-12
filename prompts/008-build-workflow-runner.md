# 008 Build Workflow Runner

Implement built-in workflows and a runner that resolves steps by assigned role rather than hardcoded provider. Missing required roles should block with clear errors. Optional steps should skip cleanly.

Tests must cover missing Coder, Reviewer, Security Auditor, and successful role-based resolution.
