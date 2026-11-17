from pydantic import BaseModel, ConfigDict, alias_generators


class BaseSchema(BaseModel):
    """Base schema with camelCase JSON aliases for frontend compatibility."""
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=alias_generators.to_camel,
        populate_by_name=True,
    )
