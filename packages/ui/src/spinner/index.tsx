'use client';
import { tva } from '@gluestack-ui/utils/nativewind-utils';
import { styled } from 'nativewind';
import React from 'react';
import { ActivityIndicator } from 'react-native';

type ISpinnerProps = React.ComponentProps<typeof ActivityIndicator>;

// `styled`'s mapping types over ActivityIndicator's full props exceed TS's union limit (TS2590) since NativeWind 5 RC:
// map over a minimal prop surface, then type the result as ActivityIndicator again (`styled` passes every prop through).
const StyledActivityIndicator = styled(ActivityIndicator as unknown as React.ComponentType<Record<'style' | 'color', unknown>>, {
  // A prop path, not `true`: react-native-css calls `.split('.')` on the value, so a boolean
  // crashes as soon as the className resolves to a colour.
  className: { target: 'style', nativeStyleMapping: { color: 'color' } },
}) as unknown as React.ComponentType<ISpinnerProps & React.RefAttributes<React.ComponentRef<typeof ActivityIndicator>>>;

const spinnerStyle = tva({});

const Spinner = React.forwardRef<React.ElementRef<typeof ActivityIndicator>, ISpinnerProps>(({ className, color, ...props }, ref) => {
  return <StyledActivityIndicator ref={ref} {...props} color={color} className={spinnerStyle({ class: className })} />;
});

Spinner.displayName = 'Spinner';

export { Spinner };
