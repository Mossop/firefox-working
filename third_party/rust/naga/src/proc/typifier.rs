use alloc::{format, string::String};

use thiserror::Error;

use crate::{
    arena::{Arena, Handle, UniqueArena},
    common::ForDebugWithTypes,
    ir,
};

/// The result of computing an expression's type.
///
/// This is the (Rust) type returned by [`ResolveContext::resolve`] to represent
/// the (Naga) type it ascribes to some expression.
///
/// You might expect such a function to simply return a `Handle<Type>`. However,
/// we want type resolution to be a read-only process, and that would limit the
/// possible results to types already present in the expression's associated
/// `UniqueArena<Type>`. Naga IR does have certain expressions whose types are
/// not certain to be present.
///
/// So instead, type resolution returns a `TypeResolution` enum: either a
/// [`Handle`], referencing some type in the arena, or a [`Value`], holding a
/// free-floating [`TypeInner`]. This extends the range to cover anything that
/// can be represented with a `TypeInner` referring to the existing arena.
///
/// What sorts of expressions can have types not available in the arena?
///
/// -   An [`Access`] or [`AccessIndex`] expression applied to a [`Vector`] or
///     [`Matrix`] must have a [`Scalar`] or [`Vector`] type. But since `Vector`
///     and `Matrix` represent their element and column types implicitly, not
///     via a handle, there may not be a suitable type in the expression's
///     associated arena. Instead, resolving such an expression returns a
///     `TypeResolution::Value(TypeInner::X { ... })`, where `X` is `Scalar` or
///     `Vector`.
///
/// -   Similarly, the type of an [`Access`] or [`AccessIndex`] expression
///     applied to a *pointer to* a vector or matrix must produce a *pointer to*
///     a scalar or vector type. These cannot be represented with a
///     [`TypeInner::Pointer`], since the `Pointer`'s `base` must point into the
///     arena, and as before, we cannot assume that a suitable scalar or vector
///     type is there. So we take things one step further and provide
///     [`TypeInner::ValuePointer`], specifically for the case of pointers to
///     scalars or vectors. This type fits in a `TypeInner` and is exactly
///     equivalent to a `Pointer` to a `Vector` or `Scalar`.
///
/// So, for example, the type of an `Access` expression applied to a value of type:
///
/// ```ignore
/// TypeInner::Matrix { columns, rows, width }
/// ```
///
/// might be:
///
/// ```ignore
/// TypeResolution::Value(TypeInner::Vector {
///     size: rows,
///     kind: ScalarKind::Float,
///     width,
/// })
/// ```
///
/// and the type of an access to a pointer of address space `space` to such a
/// matrix might be:
///
/// ```ignore
/// TypeResolution::Value(TypeInner::ValuePointer {
///     size: Some(rows),
///     kind: ScalarKind::Float,
///     width,
///     space,
/// })
/// ```
///
/// [`Handle`]: TypeResolution::Handle
/// [`Value`]: TypeResolution::Value
///
/// [`Access`]: crate::Expression::Access
/// [`AccessIndex`]: crate::Expression::AccessIndex
///
/// [`TypeInner`]: crate::TypeInner
/// [`Matrix`]: crate::TypeInner::Matrix
/// [`Pointer`]: crate::TypeInner::Pointer
/// [`Scalar`]: crate::TypeInner::Scalar
/// [`ValuePointer`]: crate::TypeInner::ValuePointer
/// [`Vector`]: crate::TypeInner::Vector
///
/// [`TypeInner::Pointer`]: crate::TypeInner::Pointer
/// [`TypeInner::ValuePointer`]: crate::TypeInner::ValuePointer
#[derive(Debug, PartialEq)]
#[cfg_attr(feature = "serialize", derive(serde::Serialize))]
#[cfg_attr(feature = "deserialize", derive(serde::Deserialize))]
pub enum TypeResolution {
    /// A type stored in the associated arena.
    Handle(Handle<crate::Type>),

    /// A free-floating [`TypeInner`], representing a type that may not be
    /// available in the associated arena. However, the `TypeInner` itself may
    /// contain `Handle<Type>` values referring to types from the arena.
    ///
    /// The inner type must only be one of the following variants:
    /// - TypeInner::Pointer
    /// - TypeInner::ValuePointer
    /// - TypeInner::Matrix (generated by matrix multiplication)
    /// - TypeInner::Vector
    /// - TypeInner::Scalar
    ///
    /// [`TypeInner`]: crate::TypeInner
    Value(crate::TypeInner),
}

impl TypeResolution {
    pub const fn handle(&self) -> Option<Handle<crate::Type>> {
        match *self {
            Self::Handle(handle) => Some(handle),
            Self::Value(_) => None,
        }
    }

    pub fn inner_with<'a>(&'a self, arena: &'a UniqueArena<crate::Type>) -> &'a crate::TypeInner {
        match *self {
            Self::Handle(handle) => &arena[handle].inner,
            Self::Value(ref inner) => inner,
        }
    }
}

// Clone is only implemented for numeric variants of `TypeInner`.
impl Clone for TypeResolution {
    fn clone(&self) -> Self {
        use crate::TypeInner as Ti;
        match *self {
            Self::Handle(handle) => Self::Handle(handle),
            Self::Value(ref v) => Self::Value(match *v {
                Ti::Scalar(scalar) => Ti::Scalar(scalar),
                Ti::Vector { size, scalar } => Ti::Vector { size, scalar },
                Ti::Matrix {
                    rows,
                    columns,
                    scalar,
                } => Ti::Matrix {
                    rows,
                    columns,
                    scalar,
                },
                Ti::Pointer { base, space } => Ti::Pointer { base, space },
                Ti::ValuePointer {
                    size,
                    scalar,
                    space,
                } => Ti::ValuePointer {
                    size,
                    scalar,
                    space,
                },
                Ti::Array { base, size, stride } => Ti::Array { base, size, stride },
                _ => unreachable!("Unexpected clone type: {:?}", v),
            }),
        }
    }
}

#[derive(Clone, Debug, Error, PartialEq)]
pub enum ResolveError {
    #[error("Index {index} is out of bounds for expression {expr:?}")]
    OutOfBoundsIndex {
        expr: Handle<crate::Expression>,
        index: u32,
    },
    #[error("Invalid access into expression {expr:?}, indexed: {indexed}")]
    InvalidAccess {
        expr: Handle<crate::Expression>,
        indexed: bool,
    },
    #[error("Invalid sub-access into type {ty:?}, indexed: {indexed}")]
    InvalidSubAccess {
        ty: Handle<crate::Type>,
        indexed: bool,
    },
    #[error("Invalid scalar {0:?}")]
    InvalidScalar(Handle<crate::Expression>),
    #[error("Invalid vector {0:?}")]
    InvalidVector(Handle<crate::Expression>),
    #[error("Invalid pointer {0:?}")]
    InvalidPointer(Handle<crate::Expression>),
    #[error("Invalid image {0:?}")]
    InvalidImage(Handle<crate::Expression>),
    #[error("Function {name} not defined")]
    FunctionNotDefined { name: String },
    #[error("Function without return type")]
    FunctionReturnsVoid,
    #[error("Incompatible operands: {0}")]
    IncompatibleOperands(String),
    #[error("Function argument {0} doesn't exist")]
    FunctionArgumentNotFound(u32),
    #[error("Special type is not registered within the module")]
    MissingSpecialType,
    #[error("Call to builtin {0} has incorrect or ambiguous arguments")]
    BuiltinArgumentsInvalid(String),
}

impl From<crate::proc::MissingSpecialType> for ResolveError {
    fn from(_unit_struct: crate::proc::MissingSpecialType) -> Self {
        ResolveError::MissingSpecialType
    }
}

pub struct ResolveContext<'a> {
    pub constants: &'a Arena<crate::Constant>,
    pub overrides: &'a Arena<crate::Override>,
    pub types: &'a UniqueArena<crate::Type>,
    pub special_types: &'a crate::SpecialTypes,
    pub global_vars: &'a Arena<crate::GlobalVariable>,
    pub local_vars: &'a Arena<crate::LocalVariable>,
    pub functions: &'a Arena<crate::Function>,
    pub arguments: &'a [crate::FunctionArgument],
}

impl<'a> ResolveContext<'a> {
    /// Initialize a resolve context from the module.
    pub const fn with_locals(
        module: &'a crate::Module,
        local_vars: &'a Arena<crate::LocalVariable>,
        arguments: &'a [crate::FunctionArgument],
    ) -> Self {
        Self {
            constants: &module.constants,
            overrides: &module.overrides,
            types: &module.types,
            special_types: &module.special_types,
            global_vars: &module.global_variables,
            local_vars,
            functions: &module.functions,
            arguments,
        }
    }

    /// Determine the type of `expr`.
    ///
    /// The `past` argument must be a closure that can resolve the types of any
    /// expressions that `expr` refers to. These can be gathered by caching the
    /// results of prior calls to `resolve`, perhaps as done by the
    /// [`front::Typifier`] utility type.
    ///
    /// Type resolution is a read-only process: this method takes `self` by
    /// shared reference. However, this means that we cannot add anything to
    /// `self.types` that we might need to describe `expr`. To work around this,
    /// this method returns a [`TypeResolution`], rather than simply returning a
    /// `Handle<Type>`; see the documentation for [`TypeResolution`] for
    /// details.
    ///
    /// [`front::Typifier`]: crate::front::Typifier
    pub fn resolve(
        &self,
        expr: &crate::Expression,
        past: impl Fn(Handle<crate::Expression>) -> Result<&'a TypeResolution, ResolveError>,
    ) -> Result<TypeResolution, ResolveError> {
        use crate::TypeInner as Ti;
        let types = self.types;
        Ok(match *expr {
            crate::Expression::Access { base, .. } => match *past(base)?.inner_with(types) {
                // Arrays and matrices can only be indexed dynamically behind a
                // pointer, but that's a validation error, not a type error, so
                // go ahead provide a type here.
                Ti::Array { base, .. } => TypeResolution::Handle(base),
                Ti::Matrix { rows, scalar, .. } => {
                    TypeResolution::Value(Ti::Vector { size: rows, scalar })
                }
                Ti::Vector { size: _, scalar } => TypeResolution::Value(Ti::Scalar(scalar)),
                Ti::ValuePointer {
                    size: Some(_),
                    scalar,
                    space,
                } => TypeResolution::Value(Ti::ValuePointer {
                    size: None,
                    scalar,
                    space,
                }),
                Ti::Pointer { base, space } => {
                    TypeResolution::Value(match types[base].inner {
                        Ti::Array { base, .. } => Ti::Pointer { base, space },
                        Ti::Vector { size: _, scalar } => Ti::ValuePointer {
                            size: None,
                            scalar,
                            space,
                        },
                        // Matrices are only dynamically indexed behind a pointer
                        Ti::Matrix {
                            columns: _,
                            rows,
                            scalar,
                        } => Ti::ValuePointer {
                            size: Some(rows),
                            scalar,
                            space,
                        },
                        Ti::BindingArray { base, .. } => Ti::Pointer { base, space },
                        ref other => {
                            log::error!("Access sub-type {:?}", other);
                            return Err(ResolveError::InvalidSubAccess {
                                ty: base,
                                indexed: false,
                            });
                        }
                    })
                }
                Ti::BindingArray { base, .. } => TypeResolution::Handle(base),
                ref other => {
                    log::error!("Access type {:?}", other);
                    return Err(ResolveError::InvalidAccess {
                        expr: base,
                        indexed: false,
                    });
                }
            },
            crate::Expression::AccessIndex { base, index } => {
                match *past(base)?.inner_with(types) {
                    Ti::Vector { size, scalar } => {
                        if index >= size as u32 {
                            return Err(ResolveError::OutOfBoundsIndex { expr: base, index });
                        }
                        TypeResolution::Value(Ti::Scalar(scalar))
                    }
                    Ti::Matrix {
                        columns,
                        rows,
                        scalar,
                    } => {
                        if index >= columns as u32 {
                            return Err(ResolveError::OutOfBoundsIndex { expr: base, index });
                        }
                        TypeResolution::Value(crate::TypeInner::Vector { size: rows, scalar })
                    }
                    Ti::Array { base, .. } => TypeResolution::Handle(base),
                    Ti::Struct { ref members, .. } => {
                        let member = members
                            .get(index as usize)
                            .ok_or(ResolveError::OutOfBoundsIndex { expr: base, index })?;
                        TypeResolution::Handle(member.ty)
                    }
                    Ti::ValuePointer {
                        size: Some(size),
                        scalar,
                        space,
                    } => {
                        if index >= size as u32 {
                            return Err(ResolveError::OutOfBoundsIndex { expr: base, index });
                        }
                        TypeResolution::Value(Ti::ValuePointer {
                            size: None,
                            scalar,
                            space,
                        })
                    }
                    Ti::Pointer {
                        base: ty_base,
                        space,
                    } => TypeResolution::Value(match types[ty_base].inner {
                        Ti::Array { base, .. } => Ti::Pointer { base, space },
                        Ti::Vector { size, scalar } => {
                            if index >= size as u32 {
                                return Err(ResolveError::OutOfBoundsIndex { expr: base, index });
                            }
                            Ti::ValuePointer {
                                size: None,
                                scalar,
                                space,
                            }
                        }
                        Ti::Matrix {
                            rows,
                            columns,
                            scalar,
                        } => {
                            if index >= columns as u32 {
                                return Err(ResolveError::OutOfBoundsIndex { expr: base, index });
                            }
                            Ti::ValuePointer {
                                size: Some(rows),
                                scalar,
                                space,
                            }
                        }
                        Ti::Struct { ref members, .. } => {
                            let member = members
                                .get(index as usize)
                                .ok_or(ResolveError::OutOfBoundsIndex { expr: base, index })?;
                            Ti::Pointer {
                                base: member.ty,
                                space,
                            }
                        }
                        Ti::BindingArray { base, .. } => Ti::Pointer { base, space },
                        ref other => {
                            log::error!("Access index sub-type {:?}", other);
                            return Err(ResolveError::InvalidSubAccess {
                                ty: ty_base,
                                indexed: true,
                            });
                        }
                    }),
                    Ti::BindingArray { base, .. } => TypeResolution::Handle(base),
                    ref other => {
                        log::error!("Access index type {:?}", other);
                        return Err(ResolveError::InvalidAccess {
                            expr: base,
                            indexed: true,
                        });
                    }
                }
            }
            crate::Expression::Splat { size, value } => match *past(value)?.inner_with(types) {
                Ti::Scalar(scalar) => TypeResolution::Value(Ti::Vector { size, scalar }),
                ref other => {
                    log::error!("Scalar type {:?}", other);
                    return Err(ResolveError::InvalidScalar(value));
                }
            },
            crate::Expression::Swizzle {
                size,
                vector,
                pattern: _,
            } => match *past(vector)?.inner_with(types) {
                Ti::Vector { size: _, scalar } => {
                    TypeResolution::Value(Ti::Vector { size, scalar })
                }
                ref other => {
                    log::error!("Vector type {:?}", other);
                    return Err(ResolveError::InvalidVector(vector));
                }
            },
            crate::Expression::Literal(lit) => TypeResolution::Value(lit.ty_inner()),
            crate::Expression::Constant(h) => TypeResolution::Handle(self.constants[h].ty),
            crate::Expression::Override(h) => TypeResolution::Handle(self.overrides[h].ty),
            crate::Expression::ZeroValue(ty) => TypeResolution::Handle(ty),
            crate::Expression::Compose { ty, .. } => TypeResolution::Handle(ty),
            crate::Expression::FunctionArgument(index) => {
                let arg = self
                    .arguments
                    .get(index as usize)
                    .ok_or(ResolveError::FunctionArgumentNotFound(index))?;
                TypeResolution::Handle(arg.ty)
            }
            crate::Expression::GlobalVariable(h) => {
                let var = &self.global_vars[h];
                if var.space == crate::AddressSpace::Handle {
                    TypeResolution::Handle(var.ty)
                } else {
                    TypeResolution::Value(Ti::Pointer {
                        base: var.ty,
                        space: var.space,
                    })
                }
            }
            crate::Expression::LocalVariable(h) => {
                let var = &self.local_vars[h];
                TypeResolution::Value(Ti::Pointer {
                    base: var.ty,
                    space: crate::AddressSpace::Function,
                })
            }
            crate::Expression::Load { pointer } => match *past(pointer)?.inner_with(types) {
                Ti::Pointer { base, space: _ } => {
                    if let Ti::Atomic(scalar) = types[base].inner {
                        TypeResolution::Value(Ti::Scalar(scalar))
                    } else {
                        TypeResolution::Handle(base)
                    }
                }
                Ti::ValuePointer {
                    size,
                    scalar,
                    space: _,
                } => TypeResolution::Value(match size {
                    Some(size) => Ti::Vector { size, scalar },
                    None => Ti::Scalar(scalar),
                }),
                ref other => {
                    log::error!("Pointer type {:?}", other);
                    return Err(ResolveError::InvalidPointer(pointer));
                }
            },
            crate::Expression::ImageSample {
                image,
                gather: Some(_),
                ..
            } => match *past(image)?.inner_with(types) {
                Ti::Image { class, .. } => TypeResolution::Value(Ti::Vector {
                    scalar: crate::Scalar {
                        kind: match class {
                            crate::ImageClass::Sampled { kind, multi: _ } => kind,
                            _ => crate::ScalarKind::Float,
                        },
                        width: 4,
                    },
                    size: crate::VectorSize::Quad,
                }),
                ref other => {
                    log::error!("Image type {:?}", other);
                    return Err(ResolveError::InvalidImage(image));
                }
            },
            crate::Expression::ImageSample { image, .. }
            | crate::Expression::ImageLoad { image, .. } => match *past(image)?.inner_with(types) {
                Ti::Image { class, .. } => TypeResolution::Value(match class {
                    crate::ImageClass::Depth { multi: _ } => Ti::Scalar(crate::Scalar::F32),
                    crate::ImageClass::Sampled { kind, multi: _ } => Ti::Vector {
                        scalar: crate::Scalar { kind, width: 4 },
                        size: crate::VectorSize::Quad,
                    },
                    crate::ImageClass::Storage { format, .. } => Ti::Vector {
                        scalar: format.into(),
                        size: crate::VectorSize::Quad,
                    },
                }),
                ref other => {
                    log::error!("Image type {:?}", other);
                    return Err(ResolveError::InvalidImage(image));
                }
            },
            crate::Expression::ImageQuery { image, query } => TypeResolution::Value(match query {
                crate::ImageQuery::Size { level: _ } => match *past(image)?.inner_with(types) {
                    Ti::Image { dim, .. } => match dim {
                        crate::ImageDimension::D1 => Ti::Scalar(crate::Scalar::U32),
                        crate::ImageDimension::D2 | crate::ImageDimension::Cube => Ti::Vector {
                            size: crate::VectorSize::Bi,
                            scalar: crate::Scalar::U32,
                        },
                        crate::ImageDimension::D3 => Ti::Vector {
                            size: crate::VectorSize::Tri,
                            scalar: crate::Scalar::U32,
                        },
                    },
                    ref other => {
                        log::error!("Image type {:?}", other);
                        return Err(ResolveError::InvalidImage(image));
                    }
                },
                crate::ImageQuery::NumLevels
                | crate::ImageQuery::NumLayers
                | crate::ImageQuery::NumSamples => Ti::Scalar(crate::Scalar::U32),
            }),
            crate::Expression::Unary { expr, .. } => past(expr)?.clone(),
            crate::Expression::Binary { op, left, right } => match op {
                crate::BinaryOperator::Add
                | crate::BinaryOperator::Subtract
                | crate::BinaryOperator::Divide
                | crate::BinaryOperator::Modulo => past(left)?.clone(),
                crate::BinaryOperator::Multiply => {
                    let (res_left, res_right) = (past(left)?, past(right)?);
                    match (res_left.inner_with(types), res_right.inner_with(types)) {
                        (
                            &Ti::Matrix {
                                columns: _,
                                rows,
                                scalar,
                            },
                            &Ti::Matrix { columns, .. },
                        ) => TypeResolution::Value(Ti::Matrix {
                            columns,
                            rows,
                            scalar,
                        }),
                        (
                            &Ti::Matrix {
                                columns: _,
                                rows,
                                scalar,
                            },
                            &Ti::Vector { .. },
                        ) => TypeResolution::Value(Ti::Vector { size: rows, scalar }),
                        (
                            &Ti::Vector { .. },
                            &Ti::Matrix {
                                columns,
                                rows: _,
                                scalar,
                            },
                        ) => TypeResolution::Value(Ti::Vector {
                            size: columns,
                            scalar,
                        }),
                        (&Ti::Scalar { .. }, _) => res_right.clone(),
                        (_, &Ti::Scalar { .. }) => res_left.clone(),
                        (&Ti::Vector { .. }, &Ti::Vector { .. }) => res_left.clone(),
                        (tl, tr) => {
                            return Err(ResolveError::IncompatibleOperands(format!(
                                "{tl:?} * {tr:?}"
                            )))
                        }
                    }
                }
                crate::BinaryOperator::Equal
                | crate::BinaryOperator::NotEqual
                | crate::BinaryOperator::Less
                | crate::BinaryOperator::LessEqual
                | crate::BinaryOperator::Greater
                | crate::BinaryOperator::GreaterEqual => {
                    // These accept scalars or vectors.
                    let scalar = crate::Scalar::BOOL;
                    let inner = match *past(left)?.inner_with(types) {
                        Ti::Scalar { .. } => Ti::Scalar(scalar),
                        Ti::Vector { size, .. } => Ti::Vector { size, scalar },
                        ref other => {
                            return Err(ResolveError::IncompatibleOperands(format!(
                                "{op:?}({other:?}, _)"
                            )))
                        }
                    };
                    TypeResolution::Value(inner)
                }
                crate::BinaryOperator::LogicalAnd | crate::BinaryOperator::LogicalOr => {
                    // These accept scalars only.
                    let bool = Ti::Scalar(crate::Scalar::BOOL);
                    let ty = past(left)?.inner_with(types);
                    if *ty == bool {
                        TypeResolution::Value(bool)
                    } else {
                        return Err(ResolveError::IncompatibleOperands(format!(
                            "{op:?}({:?}, _)",
                            ty.for_debug(types),
                        )));
                    }
                }
                crate::BinaryOperator::And
                | crate::BinaryOperator::ExclusiveOr
                | crate::BinaryOperator::InclusiveOr
                | crate::BinaryOperator::ShiftLeft
                | crate::BinaryOperator::ShiftRight => past(left)?.clone(),
            },
            crate::Expression::AtomicResult { ty, .. } => TypeResolution::Handle(ty),
            crate::Expression::SubgroupOperationResult { ty } => TypeResolution::Handle(ty),
            crate::Expression::WorkGroupUniformLoadResult { ty } => TypeResolution::Handle(ty),
            crate::Expression::Select { accept, .. } => past(accept)?.clone(),
            crate::Expression::Derivative { expr, .. } => past(expr)?.clone(),
            crate::Expression::Relational { fun, argument } => match fun {
                crate::RelationalFunction::All | crate::RelationalFunction::Any => {
                    TypeResolution::Value(Ti::Scalar(crate::Scalar::BOOL))
                }
                crate::RelationalFunction::IsNan | crate::RelationalFunction::IsInf => {
                    match *past(argument)?.inner_with(types) {
                        Ti::Scalar { .. } => TypeResolution::Value(Ti::Scalar(crate::Scalar::BOOL)),
                        Ti::Vector { size, .. } => TypeResolution::Value(Ti::Vector {
                            scalar: crate::Scalar::BOOL,
                            size,
                        }),
                        ref other => {
                            return Err(ResolveError::IncompatibleOperands(format!(
                                "{fun:?}({other:?})"
                            )))
                        }
                    }
                }
            },
            crate::Expression::Math {
                fun,
                arg,
                arg1,
                arg2: _,
                arg3: _,
            } => {
                use crate::proc::OverloadSet as _;

                let mut overloads = fun.overloads();
                log::debug!(
                    "initial overloads for {fun:?}, {:#?}",
                    overloads.for_debug(types)
                );

                // If any argument is not a constant expression, then no
                // overloads that accept abstract values should be considered.
                // `OverloadSet::concrete_only` is supposed to help impose this
                // restriction. However, no `MathFunction` accepts a mix of
                // abstract and concrete arguments, so we don't need to worry
                // about that here.

                let res_arg = past(arg)?;
                overloads = overloads.arg(0, res_arg.inner_with(types), types);
                log::debug!(
                    "overloads after arg 0 of type {:?}: {:#?}",
                    res_arg.for_debug(types),
                    overloads.for_debug(types)
                );

                if let Some(arg1) = arg1 {
                    let res_arg1 = past(arg1)?;
                    overloads = overloads.arg(1, res_arg1.inner_with(types), types);
                    log::debug!(
                        "overloads after arg 1 of type {:?}: {:#?}",
                        res_arg1.for_debug(types),
                        overloads.for_debug(types)
                    );
                }

                if overloads.is_empty() {
                    return Err(ResolveError::BuiltinArgumentsInvalid(format!("{fun:?}")));
                }

                let rule = overloads.most_preferred();

                rule.conclusion.into_resolution(self.special_types)?
            }
            crate::Expression::As {
                expr,
                kind,
                convert,
            } => match *past(expr)?.inner_with(types) {
                Ti::Scalar(crate::Scalar { width, .. }) => {
                    TypeResolution::Value(Ti::Scalar(crate::Scalar {
                        kind,
                        width: convert.unwrap_or(width),
                    }))
                }
                Ti::Vector {
                    size,
                    scalar: crate::Scalar { kind: _, width },
                } => TypeResolution::Value(Ti::Vector {
                    size,
                    scalar: crate::Scalar {
                        kind,
                        width: convert.unwrap_or(width),
                    },
                }),
                Ti::Matrix {
                    columns,
                    rows,
                    mut scalar,
                } => {
                    if let Some(width) = convert {
                        scalar.width = width;
                    }
                    TypeResolution::Value(Ti::Matrix {
                        columns,
                        rows,
                        scalar,
                    })
                }
                ref other => {
                    return Err(ResolveError::IncompatibleOperands(format!(
                        "{other:?} as {kind:?}"
                    )))
                }
            },
            crate::Expression::CallResult(function) => {
                let result = self.functions[function]
                    .result
                    .as_ref()
                    .ok_or(ResolveError::FunctionReturnsVoid)?;
                TypeResolution::Handle(result.ty)
            }
            crate::Expression::ArrayLength(_) => {
                TypeResolution::Value(Ti::Scalar(crate::Scalar::U32))
            }
            crate::Expression::RayQueryProceedResult => {
                TypeResolution::Value(Ti::Scalar(crate::Scalar::BOOL))
            }
            crate::Expression::RayQueryGetIntersection { .. } => {
                let result = self
                    .special_types
                    .ray_intersection
                    .ok_or(ResolveError::MissingSpecialType)?;
                TypeResolution::Handle(result)
            }
            crate::Expression::RayQueryVertexPositions { .. } => {
                let result = self
                    .special_types
                    .ray_vertex_return
                    .ok_or(ResolveError::MissingSpecialType)?;
                TypeResolution::Handle(result)
            }
            crate::Expression::SubgroupBallotResult => TypeResolution::Value(Ti::Vector {
                scalar: crate::Scalar::U32,
                size: crate::VectorSize::Quad,
            }),
        })
    }
}

/// Compare two types.
///
/// This is the most general way of comparing two types, as it can distinguish
/// two structs with different names but the same members. For other ways, see
/// [`TypeInner::non_struct_equivalent`] and [`TypeInner::eq`].
///
/// In Naga code, this is usually called via the like-named methods on [`Module`],
/// [`GlobalCtx`], and `BlockContext`.
///
/// [`TypeInner::non_struct_equivalent`]: crate::ir::TypeInner::non_struct_equivalent
/// [`TypeInner::eq`]: crate::ir::TypeInner
/// [`Module`]: crate::ir::Module
/// [`GlobalCtx`]: crate::proc::GlobalCtx
pub fn compare_types(
    lhs: &TypeResolution,
    rhs: &TypeResolution,
    types: &UniqueArena<crate::Type>,
) -> bool {
    match lhs {
        &TypeResolution::Handle(lhs_handle)
            if matches!(
                types[lhs_handle],
                ir::Type {
                    inner: ir::TypeInner::Struct { .. },
                    ..
                }
            ) =>
        {
            // Structs can only be in the arena, not in a TypeResolution::Value
            rhs.handle()
                .is_some_and(|rhs_handle| lhs_handle == rhs_handle)
        }
        _ => lhs
            .inner_with(types)
            .non_struct_equivalent(rhs.inner_with(types), types),
    }
}

#[test]
fn test_error_size() {
    assert_eq!(size_of::<ResolveError>(), 32);
}
