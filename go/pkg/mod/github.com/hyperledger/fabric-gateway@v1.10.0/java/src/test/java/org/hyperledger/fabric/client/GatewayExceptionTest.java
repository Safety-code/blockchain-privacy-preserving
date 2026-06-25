/*
 * Copyright 2024 IBM All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

package org.hyperledger.fabric.client;

import io.grpc.StatusRuntimeException;

final class GatewayExceptionTest extends CommonGatewayExceptionTest {
    protected Exception newInstance(final StatusRuntimeException e) {
        return new GatewayException(e);
    }
}
