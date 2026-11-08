
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"private": {
          Tables: {
            "ai_usage_records": {
                  Row: {
                    "account_id": string,"charged_tokens": number,"dispatched": boolean,"environment_id": string,"id": string,"input_tokens": number,"operation_id": string,"outcome": string | null,"output_tokens": number,"reserved_at": string,"settlement": Json | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"charged_tokens": number,"dispatched"?: boolean,"environment_id": string,"id"?: string,"input_tokens": number,"operation_id": string,"outcome"?: string | null,"output_tokens": number,"reserved_at": string,"settlement"?: Json | null
                  }
                  Update: {
                    "account_id"?: string,"charged_tokens"?: number,"dispatched"?: boolean,"environment_id"?: string,"id"?: string,"input_tokens"?: number,"operation_id"?: string,"outcome"?: string | null,"output_tokens"?: number,"reserved_at"?: string,"settlement"?: Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_usage_records_operation_id_fkey"
      columns: ["operation_id"]
isOneToOne: false
      referencedRelation: "llm_operations"
      referencedColumns: ["id"]
    }
                  ]
                },"llm_operations": {
                  Row: {
                    "account_id": string,"environment_id": string,"expires_at": string,"fingerprint": string,"id": string,"idempotency_key": string,"operation": string,"resource_id": string,"state": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"environment_id": string,"expires_at": string,"fingerprint": string,"id"?: string,"idempotency_key": string,"operation": string,"resource_id": string,"state"?: string
                  }
                  Update: {
                    "account_id"?: string,"environment_id"?: string,"expires_at"?: string,"fingerprint"?: string,"id"?: string,"idempotency_key"?: string,"operation"?: string,"resource_id"?: string,"state"?: string
                  }
                  Relationships: [

                  ]
                },"llm_usage_events": {
                  Row: {
                    "account_id": string,"details": NonNullable<Json>,"environment_id": string,"event_type": string,"id": string,"operation_id": string,"recorded_at": string,"reservation_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "account_id": string,"details": NonNullable<Json>,"environment_id": string,"event_type": string,"id"?: string,"operation_id": string,"recorded_at"?: string,"reservation_id"?: string | null
                  }
                  Update: {
                    "account_id"?: string,"details"?: NonNullable<Json>,"environment_id"?: string,"event_type"?: string,"id"?: string,"operation_id"?: string,"recorded_at"?: string,"reservation_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "llm_usage_events_operation_id_fkey"
      columns: ["operation_id"]
isOneToOne: false
      referencedRelation: "llm_operations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "llm_usage_events_reservation_id_fkey"
      columns: ["reservation_id"]
isOneToOne: false
      referencedRelation: "ai_usage_records"
      referencedColumns: ["id"]
    }
                  ]
                },"profile_roles": {
                  Row: {
                    "id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"role": string
                  }
                  Update: {
                    "id"?: string,"role"?: string
                  }
                  Relationships: [

                  ]
                },"submission_audit_orders": {
                  Row: {
                    "audit_order": number,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "audit_order": number,"submission_id": string
                  }
                  Update: {
                    "audit_order"?: number,"submission_id"?: string
                  }
                  Relationships: [

                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "current_domain_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"domain_code_lines":
{ Args: { "value": string }; Returns: (string)[]
                           },
"normalize_display_name":
{ Args: { "value": string }; Returns: string
                           },
"valid_domain_categories":
{ Args: { "value": (Database["public"]['Enums']["flaw_category"])[] }; Returns: boolean
                           },
"valid_domain_code":
{ Args: { "value": string }; Returns: boolean
                           },
"valid_domain_text":
{ Args: { "max_length": number,"value": string }; Returns: boolean
                           },
"valid_proposal_snapshot":
{ Args: { "snapshot": Json }; Returns: boolean
                           },
"valid_revision_diff":
{ Args: { "diff": Json,"flawed_code": string,"language": Database["public"]['Enums']["challenge_language"],"working_code": string }; Returns: boolean
                           },
"valid_summary_output":
{ Args: { "summary": Json }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "ai_grade_assessments": {
                  Row: {
                    "comment_id": string | null,"distance": number | null,"flaw_id": string,"grade_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment_id"?: string | null,"distance"?: number | null,"flaw_id": string,"grade_id": string
                  }
                  Update: {
                    "comment_id"?: string | null,"distance"?: number | null,"flaw_id"?: string,"grade_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_grade_assessments_flaw_id_fkey"
      columns: ["flaw_id"]
isOneToOne: false
      referencedRelation: "revision_flaws"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_grade_assessments_grade_id_comment_id_fkey"
      columns: ["grade_id","comment_id"]
isOneToOne: true
      referencedRelation: "ai_grade_comment_results"
      referencedColumns: ["grade_id","comment_id"]
    },{
      foreignKeyName: "ai_grade_assessments_grade_id_fkey"
      columns: ["grade_id"]
isOneToOne: false
      referencedRelation: "ai_grade_evidence"
      referencedColumns: ["grade_id"]
    }
                  ]
                },"ai_grade_comment_results": {
                  Row: {
                    "comment_id": string,"explanation_credit": number | null,"feedback": string | null,"fix_credit": number | null,"grade_id": string,"kind": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment_id": string,"explanation_credit"?: number | null,"feedback"?: string | null,"fix_credit"?: number | null,"grade_id": string,"kind": string
                  }
                  Update: {
                    "comment_id"?: string,"explanation_credit"?: number | null,"feedback"?: string | null,"fix_credit"?: number | null,"grade_id"?: string,"kind"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_grade_comment_results_comment_id_fkey"
      columns: ["comment_id"]
isOneToOne: false
      referencedRelation: "submission_comments"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_grade_comment_results_grade_id_fkey"
      columns: ["grade_id"]
isOneToOne: false
      referencedRelation: "ai_grades"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_grade_eligible_hints": {
                  Row: {
                    "category": Database["public"]['Enums']["flaw_category"],"grade_id": string,"hint_id": string,"ordinal": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["flaw_category"],"grade_id": string,"hint_id": string,"ordinal": number
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["flaw_category"],"grade_id"?: string,"hint_id"?: string,"ordinal"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_grade_eligible_hints_grade_id_fkey"
      columns: ["grade_id"]
isOneToOne: false
      referencedRelation: "ai_grades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_grade_eligible_hints_hint_id_fkey"
      columns: ["hint_id"]
isOneToOne: false
      referencedRelation: "flaw_hints"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_grade_evidence": {
                  Row: {
                    "created_at": string,"grade_id": string,"grading_run_id": string,"provider_output_retried": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"grade_id": string,"grading_run_id": string,"provider_output_retried": boolean
                  }
                  Update: {
                    "created_at"?: string,"grade_id"?: string,"grading_run_id"?: string,"provider_output_retried"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_grade_evidence_grade_id_fkey"
      columns: ["grade_id"]
isOneToOne: true
      referencedRelation: "ai_grades"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "ai_grade_evidence_grading_run_id_fkey"
      columns: ["grading_run_id"]
isOneToOne: true
      referencedRelation: "grading_runs"
      referencedColumns: ["id"]
    }
                  ]
                },"ai_grades": {
                  Row: {
                    "explanation_points": number,"fix_points": number,"id": string,"identification_points": number,"passed": boolean,"score": number,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "explanation_points": number,"fix_points": number,"id"?: string,"identification_points": number,"passed": boolean,"score": number,"submission_id": string
                  }
                  Update: {
                    "explanation_points"?: number,"fix_points"?: number,"id"?: string,"identification_points"?: number,"passed"?: boolean,"score"?: number,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "ai_grades_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: true
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"challenge_drafts": {
                  Row: {
                    "categories": (Database["public"]['Enums']["flaw_category"])[],"challenge_id": string,"description": string,"difficulty": Database["public"]['Enums']["challenge_difficulty"],"draft_version": number,"flaw_count": number,"generation_id": string | null,"language": Database["public"]['Enums']["challenge_language"],"title": string,"working_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "categories": (Database["public"]['Enums']["flaw_category"])[],"challenge_id": string,"description": string,"difficulty": Database["public"]['Enums']["challenge_difficulty"],"draft_version"?: number,"flaw_count": number,"generation_id"?: string | null,"language": Database["public"]['Enums']["challenge_language"],"title": string,"working_code": string
                  }
                  Update: {
                    "categories"?: (Database["public"]['Enums']["flaw_category"])[],"challenge_id"?: string,"description"?: string,"difficulty"?: Database["public"]['Enums']["challenge_difficulty"],"draft_version"?: number,"flaw_count"?: number,"generation_id"?: string | null,"language"?: Database["public"]['Enums']["challenge_language"],"title"?: string,"working_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "challenge_drafts_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: true
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "challenge_drafts_challenge_id_generation_id_fkey"
      columns: ["challenge_id","generation_id"]
isOneToOne: false
      referencedRelation: "proposal_sets"
      referencedColumns: ["challenge_id","id"]
    }
                  ]
                },"challenge_revisions": {
                  Row: {
                    "challenge_id": string,"description": string,"difficulty": Database["public"]['Enums']["challenge_difficulty"],"flawed_code": string,"id": string,"language": Database["public"]['Enums']["challenge_language"],"published_at": string,"revision_number": number,"title": string
                  }
                  ComputedFields: never
                  Insert: {
                    "challenge_id": string,"description": string,"difficulty": Database["public"]['Enums']["challenge_difficulty"],"flawed_code": string,"id"?: string,"language": Database["public"]['Enums']["challenge_language"],"published_at"?: string,"revision_number": number,"title": string
                  }
                  Update: {
                    "challenge_id"?: string,"description"?: string,"difficulty"?: Database["public"]['Enums']["challenge_difficulty"],"flawed_code"?: string,"id"?: string,"language"?: Database["public"]['Enums']["challenge_language"],"published_at"?: string,"revision_number"?: number,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "challenge_revisions_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: false
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    }
                  ]
                },"challenges": {
                  Row: {
                    "author_id": string,"author_role": string | null,"created_at": string,"id": string,"published_revision_id": string | null,"row_version": number,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"author_role"?: never,"created_at"?: string,"id"?: string,"published_revision_id"?: string | null,"row_version"?: number,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string,"author_role"?: never,"created_at"?: string,"id"?: string,"published_revision_id"?: string | null,"row_version"?: number,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "challenges_author_id_author_role_fkey"
      columns: ["author_id","author_role"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","role"]
    },{
      foreignKeyName: "challenges_id_published_revision_id_fkey"
      columns: ["id","published_revision_id"]
isOneToOne: false
      referencedRelation: "challenge_revisions"
      referencedColumns: ["challenge_id","id"]
    }
                  ]
                },"flag_resolutions": {
                  Row: {
                    "actor_id": string,"actor_role": string | null,"audit_order": number,"created_at": string,"disposition": string,"flag_id": string,"id": string,"reason": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"actor_role"?: never,"audit_order": number,"created_at"?: string,"disposition": string,"flag_id": string,"id"?: string,"reason": string
                  }
                  Update: {
                    "actor_id"?: string,"actor_role"?: never,"audit_order"?: number,"created_at"?: string,"disposition"?: string,"flag_id"?: string,"id"?: string,"reason"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flag_resolutions_actor_id_actor_role_fkey"
      columns: ["actor_id","actor_role"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","role"]
    },{
      foreignKeyName: "flag_resolutions_flag_id_fkey"
      columns: ["flag_id"]
isOneToOne: false
      referencedRelation: "review_flags"
      referencedColumns: ["id"]
    }
                  ]
                },"flaw_hints": {
                  Row: {
                    "flaw_id": string,"generation_metadata": NonNullable<Json>,"id": string,"revision_id": string,"text": string
                  }
                  ComputedFields: never
                  Insert: {
                    "flaw_id": string,"generation_metadata": NonNullable<Json>,"id"?: string,"revision_id": string,"text": string
                  }
                  Update: {
                    "flaw_id"?: string,"generation_metadata"?: NonNullable<Json>,"id"?: string,"revision_id"?: string,"text"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "flaw_hints_revision_id_flaw_id_fkey"
      columns: ["revision_id","flaw_id"]
isOneToOne: false
      referencedRelation: "revision_flaws"
      referencedColumns: ["revision_id","id"]
    }
                  ]
                },"grade_overrides": {
                  Row: {
                    "actor_id": string,"actor_role": string | null,"audit_order": number,"created_at": string,"id": string,"reason": string,"score": number,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"actor_role"?: never,"audit_order": number,"created_at"?: string,"id"?: string,"reason": string,"score": number,"submission_id": string
                  }
                  Update: {
                    "actor_id"?: string,"actor_role"?: never,"audit_order"?: number,"created_at"?: string,"id"?: string,"reason"?: string,"score"?: number,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "grade_overrides_actor_id_actor_role_fkey"
      columns: ["actor_id","actor_role"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","role"]
    },{
      foreignKeyName: "grade_overrides_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"grading_runs": {
                  Row: {
                    "created_at": string,"failure_code": string | null,"finished_at": string | null,"id": string,"run_number": number,"state": string,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"failure_code"?: string | null,"finished_at"?: string | null,"id"?: string,"run_number": number,"state": string,"submission_id": string
                  }
                  Update: {
                    "created_at"?: string,"failure_code"?: string | null,"finished_at"?: string | null,"id"?: string,"run_number"?: number,"state"?: string,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "grading_runs_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"performance_summaries": {
                  Row: {
                    "created_at": string,"id": string,"input_fingerprint": string,"learner_id": string,"learner_role": string | null,"output": NonNullable<Json>,"requested_by": string,"requester_role": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"input_fingerprint": string,"learner_id": string,"learner_role"?: never,"output": NonNullable<Json>,"requested_by": string,"requester_role"?: never
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"input_fingerprint"?: string,"learner_id"?: string,"learner_role"?: never,"output"?: NonNullable<Json>,"requested_by"?: string,"requester_role"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "performance_summaries_learner_id_learner_role_fkey"
      columns: ["learner_id","learner_role"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","role"]
    },{
      foreignKeyName: "performance_summaries_requested_by_requester_role_fkey"
      columns: ["requested_by","requester_role"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","role"]
    }
                  ]
                },"performance_summary_evidence": {
                  Row: {
                    "item_kind": string,"item_ordinal": number,"submission_id": string,"summary_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "item_kind": string,"item_ordinal": number,"submission_id": string,"summary_id": string
                  }
                  Update: {
                    "item_kind"?: string,"item_ordinal"?: number,"submission_id"?: string,"summary_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "performance_summary_evidence_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "performance_summary_evidence_summary_id_fkey"
      columns: ["summary_id"]
isOneToOne: false
      referencedRelation: "performance_summaries"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "display_name": string,"id": string,"role": string
                  }
                  ComputedFields: never
                  Insert: {
                    "display_name": string,"id": string,"role": string
                  }
                  Update: {
                    "display_name"?: string,"id"?: string,"role"?: string
                  }
                  Relationships: [

                  ]
                },"proposal_decisions": {
                  Row: {
                    "decision": string,"proposal_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "decision"?: string,"proposal_id": string
                  }
                  Update: {
                    "decision"?: string,"proposal_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "proposal_decisions_proposal_id_fkey"
      columns: ["proposal_id"]
isOneToOne: true
      referencedRelation: "proposals"
      referencedColumns: ["id"]
    }
                  ]
                },"proposal_sets": {
                  Row: {
                    "challenge_id": string,"created_at": string,"id": string,"input_snapshot": NonNullable<Json>,"source_draft_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "challenge_id": string,"created_at"?: string,"id"?: string,"input_snapshot": NonNullable<Json>,"source_draft_version": number
                  }
                  Update: {
                    "challenge_id"?: string,"created_at"?: string,"id"?: string,"input_snapshot"?: NonNullable<Json>,"source_draft_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "proposal_sets_challenge_id_fkey"
      columns: ["challenge_id"]
isOneToOne: false
      referencedRelation: "challenges"
      referencedColumns: ["id"]
    }
                  ]
                },"proposals": {
                  Row: {
                    "category": Database["public"]['Enums']["flaw_category"],"explanation": string,"fix": string,"id": string,"original_snippet": string,"proposal_set_id": string,"replacement_snippet": string,"source_end_line": number,"source_start_line": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["flaw_category"],"explanation": string,"fix": string,"id"?: string,"original_snippet": string,"proposal_set_id": string,"replacement_snippet": string,"source_end_line": number,"source_start_line": number
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["flaw_category"],"explanation"?: string,"fix"?: string,"id"?: string,"original_snippet"?: string,"proposal_set_id"?: string,"replacement_snippet"?: string,"source_end_line"?: number,"source_start_line"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "proposals_proposal_set_id_fkey"
      columns: ["proposal_set_id"]
isOneToOne: false
      referencedRelation: "proposal_sets"
      referencedColumns: ["id"]
    }
                  ]
                },"review_flags": {
                  Row: {
                    "comment_id": string | null,"created_at": string,"id": string,"kind": string,"reason": string | null,"source": string,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "comment_id"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"reason"?: string | null,"source": string,"submission_id": string
                  }
                  Update: {
                    "comment_id"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"reason"?: string | null,"source"?: string,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "review_flags_submission_id_comment_id_fkey"
      columns: ["submission_id","comment_id"]
isOneToOne: false
      referencedRelation: "submission_comments"
      referencedColumns: ["submission_id","id"]
    },{
      foreignKeyName: "review_flags_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"revision_answers": {
                  Row: {
                    "real_diff": NonNullable<Json>,"revision_id": string,"working_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "real_diff": NonNullable<Json>,"revision_id": string,"working_code": string
                  }
                  Update: {
                    "real_diff"?: NonNullable<Json>,"revision_id"?: string,"working_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "revision_answers_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: true
      referencedRelation: "challenge_revisions"
      referencedColumns: ["id"]
    }
                  ]
                },"revision_flaws": {
                  Row: {
                    "category": Database["public"]['Enums']["flaw_category"],"end_line": number,"explanation": string,"fix": string,"id": string,"original_snippet": string,"proposal_id": string,"replacement_snippet": string,"revision_id": string,"source_end_line": number,"source_start_line": number,"start_line": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["flaw_category"],"end_line": number,"explanation": string,"fix": string,"id"?: string,"original_snippet": string,"proposal_id": string,"replacement_snippet": string,"revision_id": string,"source_end_line": number,"source_start_line": number,"start_line": number
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["flaw_category"],"end_line"?: number,"explanation"?: string,"fix"?: string,"id"?: string,"original_snippet"?: string,"proposal_id"?: string,"replacement_snippet"?: string,"revision_id"?: string,"source_end_line"?: number,"source_start_line"?: number,"start_line"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "revision_flaws_proposal_id_fkey"
      columns: ["proposal_id"]
isOneToOne: false
      referencedRelation: "proposals"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "revision_flaws_revision_id_fkey"
      columns: ["revision_id"]
isOneToOne: false
      referencedRelation: "revision_answers"
      referencedColumns: ["revision_id"]
    }
                  ]
                },"submission_comments": {
                  Row: {
                    "body": string,"id": string,"line": number,"ordinal": number,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"id"?: string,"line": number,"ordinal": number,"submission_id": string
                  }
                  Update: {
                    "body"?: string,"id"?: string,"line"?: number,"ordinal"?: number,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_comments_submission_id_fkey"
      columns: ["submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "attempt_number": number,"challenge_id": string,"id": string,"learner_id": string,"learner_role": string | null,"previous_attempt_number": number | null,"previous_submission_id": string | null,"revision_id": string,"submitted_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_number": number,"challenge_id": string,"id"?: string,"learner_id": string,"learner_role"?: never,"previous_attempt_number"?: never,"previous_submission_id"?: string | null,"revision_id": string,"submitted_at"?: string
                  }
                  Update: {
                    "attempt_number"?: number,"challenge_id"?: string,"id"?: string,"learner_id"?: string,"learner_role"?: never,"previous_attempt_number"?: never,"previous_submission_id"?: string | null,"revision_id"?: string,"submitted_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_challenge_id_revision_id_fkey"
      columns: ["challenge_id","revision_id"]
isOneToOne: false
      referencedRelation: "challenge_revisions"
      referencedColumns: ["challenge_id","id"]
    },{
      foreignKeyName: "submissions_learner_id_learner_role_fkey"
      columns: ["learner_id","learner_role"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id","role"]
    },{
      foreignKeyName: "submissions_previous_submission_id_learner_id_challenge_id_fkey"
      columns: ["previous_submission_id","learner_id","challenge_id","revision_id","previous_attempt_number"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["id","learner_id","challenge_id","revision_id","attempt_number"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "challenge_generation_access":
{ Args: { "resource_id": string }; Returns: string
                           },
"llm_accounting":
{ Args: { "action": string,"args": Json }; Returns: Json
                           },
"llm_grading_context":
{ Args: { "account_id": string,"submission_id": string }; Returns: Json
                           }
          }
          Enums: {
            "challenge_difficulty": "easy"|"medium"|"hard","challenge_language": "python"|"java"|"javascript"|"typescript","flaw_category": "logic_bug"|"edge_case"|"error_handling"|"security"|"performance"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {

          }
        },"private": {
          Enums: {

          }
        },"public": {
          Enums: {
            "challenge_difficulty": ["easy", "medium", "hard"],"challenge_language": ["python", "java", "javascript", "typescript"],"flaw_category": ["logic_bug", "edge_case", "error_handling", "security", "performance"]
          }
        }
} as const
