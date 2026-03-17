---
name: vector-entity-docs
description: Keep Vector's core entity documentation up to date when changing the meaning, workflow, visibility, permissions, or relationships of issues, teams, projects, documents, or views. Use when implementing or reviewing core product model changes so docs/product/04-entities.md and related README links stay accurate.
---

# Vector Entity Docs

Use this skill whenever a task changes the product meaning or core behavior of Vector's main workspace entities:

- issues
- teams
- projects
- documents
- views

This skill is for product-model changes, not routine copy edits.

## What Counts As A Trigger

Use this skill when a change affects any of the following:

- what an entity is for
- how users create, organize, or share it
- visibility or permission behavior
- major relationships between entities
- important new layouts, workflows, or lifecycle rules
- public-facing behavior that changes how an entity is presented

## Required Updates

When triggered:

1. Update `docs/product/04-entities.md` to reflect the current model.
2. Update `README.md` only if the top-level summary or links need to change.
3. Keep the documentation focused on meaning, purpose, and basic functionality rather than implementation details.
4. If a change only affects one entity, update that section and any relationship notes that depend on it.

## Writing Standard

- Be concise and product-facing.
- Explain what the entity means in the workspace and when to use it.
- Call out visibility, ownership, and relationship changes when they matter.
- Do not dump backend schema details or low-level component behavior into the entity doc.
