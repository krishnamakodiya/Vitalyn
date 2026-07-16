MEDICAL_DISCLAIMER = (
    "Vitalyn summarizes user-provided health facts and does not diagnose, "
    "treat, or replace professional medical advice."
)

FORBIDDEN_DIAGNOSTIC_TERMS = (
    "diagnosis:",
    "you have ",
    "you are suffering from ",
    "this means you have ",
)


def assert_non_diagnostic_text(text: str) -> None:
    lowered = text.lower()
    for term in FORBIDDEN_DIAGNOSTIC_TERMS:
        if term in lowered:
            raise ValueError("diagnostic language is not allowed")

