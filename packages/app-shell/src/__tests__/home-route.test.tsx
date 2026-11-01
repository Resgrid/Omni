import { act, render, screen } from '@testing-library/react-native';
import React from 'react';

import { HomeRoute, resolveHomeRedirect } from '../home-route';
import { defineRoutes } from '../routes/define-routes';
import { setRouteContract } from '../routes/href';
import { ShellStack } from '../shell/shell-stack';
import { activateVariant } from './helpers/variants';

describe('HomeRoute (the (app) index)', () => {
  afterEach(() => {
    act(() => setRouteContract(defineRoutes(['home'])));
  });

  it("hands / over to shell.homeRoute when the variant declares that route (Responder's member home)", () => {
    activateVariant('responder');
    act(() => setRouteContract(defineRoutes(['home', 'homeTab'])));
    render(<HomeRoute />);
    expect(screen.getByTestId('mock-redirect')).toHaveTextContent('/home');
  });

  it('keeps the placeholder while the homeRoute has no route yet (Dispatch console, BigBoard dashboard) or is / itself', () => {
    activateVariant('dispatch');
    act(() => setRouteContract(defineRoutes(['home'])));
    render(<HomeRoute />);
    expect(screen.getByTestId('home-placeholder')).toBeTruthy();
    expect(resolveHomeRedirect('/')).toBeNull();
    expect(resolveHomeRedirect('/home')).toBeNull();
  });
});

describe('ShellStack', () => {
  it('is a stack navigator (the shell header titles its screens)', () => {
    render(<ShellStack />);
    expect(screen.getByTestId('mock-stack')).toBeTruthy();
  });
});
